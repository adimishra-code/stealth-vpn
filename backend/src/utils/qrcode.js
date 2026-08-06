const QRCode = require('qrcode');

async function generateQRBase64(configString) {
  const pngBuffer = await QRCode.toBuffer(configString, {
    errorCorrectionLevel: 'M',
    type: 'png',
    margin: 2,
    scale: 8,
  });
  return `data:image/png;base64,${pngBuffer.toString('base64')}`;
}

module.exports = { generateQRBase64 };