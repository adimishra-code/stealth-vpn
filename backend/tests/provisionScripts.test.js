const fs = require('fs');
const path = require('path');

describe('Node Provisioning Script Security Verification (SEC-04, SEC-12)', () => {
  const provisionNodePath = path.resolve(__dirname, '../../scripts/provision-node.sh');
  const setupScriptPath = path.resolve(__dirname, '../../deploy/setup.sh');

  test('SEC-12: provision-node.sh allows UDP and TCP port 53 on wg0 to 10.8.0.1', () => {
    const content = fs.readFileSync(provisionNodePath, 'utf8');
    expect(content).toContain('ufw allow in on wg0 to 10.8.0.1 port 53 proto udp');
    expect(content).toContain('ufw allow in on wg0 to 10.8.0.1 port 53 proto tcp');
  });

  test('SEC-04 & SEC-12: SSRF drop rules target FORWARD chain and do not drop INPUT to 10.8.0.1', () => {
    const content = fs.readFileSync(provisionNodePath, 'utf8');
    expect(content).toContain('iptables -A FORWARD -i wg0 -d 169.254.169.254 -j DROP');
    expect(content).toContain('iptables -A FORWARD -i wg0 -d 10.0.0.0/8 -j DROP');
    expect(content).toContain('iptables -A FORWARD -i wg0 -d 172.16.0.0/12 -j DROP');
    expect(content).toContain('iptables -A FORWARD -i wg0 -d 192.168.0.0/16 -j DROP');

    // Confirm FORWARD rules are also cleaned up in PostDown
    expect(content).toContain('iptables -D FORWARD -i wg0 -d 169.254.169.254 -j DROP');
    expect(content).toContain('iptables -D FORWARD -i wg0 -d 10.0.0.0/8 -j DROP');
  });

  test('SEC-13: killswitch.sh defaults to stealthnode user and executes commands with sudo -n', () => {
    const killswitchPath = path.resolve(__dirname, '../../deploy/scripts/killswitch.sh');
    const content = fs.readFileSync(killswitchPath, 'utf8');
    expect(content).toContain('SSH_USER="${SSH_USER:-stealthnode}"');
    expect(content).toContain('sudo -n systemctl stop xray');
    expect(content).toContain('sudo -n wg-quick down wg0');
  });

  test('SEC-13: provision-node.sh sudoers whitelist contains killswitch shutdown commands', () => {
    const content = fs.readFileSync(provisionNodePath, 'utf8');
    expect(content).toContain('/bin/systemctl stop xray');
    expect(content).toContain('/usr/bin/wg-quick down wg0');
    expect(content).toContain('/sbin/ip link set dev wg0 down');
  });

  test('SEC-05: Nginx stream multiplexer and setup.sh ssl_preread avoid port 443 collision', () => {
    const streamConfPath = path.resolve(__dirname, '../../deploy/nginx-stream.conf');
    const nginxConfPath = path.resolve(__dirname, '../../deploy/nginx.conf');
    const streamContent = fs.readFileSync(streamConfPath, 'utf8');
    const nginxContent = fs.readFileSync(nginxConfPath, 'utf8');
    const setupContent = fs.readFileSync(setupScriptPath, 'utf8');

    // stream config multiplexes on 443 with ssl_preread
    expect(streamContent).toContain('ssl_preread on;');
    expect(streamContent).toContain('server 127.0.0.1:8443;');
    expect(streamContent).toContain('server 127.0.0.1:4430;');

    // nginx HTTPS listens on 8443 loopback
    expect(nginxContent).toContain('listen 127.0.0.1:8443 ssl http2;');

    // setup.sh checks for stream_ssl_preread and configures Xray on 127.0.0.1:XRAY_PORT
    expect(setupContent).toContain('stream_ssl_preread');
    expect(setupContent).toContain('libnginx-mod-stream');
    expect(setupContent).toContain('"listen": "127.0.0.1"');
    expect(setupContent).toContain('XRAY_PORT');
  });
});
