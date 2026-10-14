import QRCode from 'qrcode';

export async function renderQRCode(canvasElement, text, options = {}) {
  if (!canvasElement || !text) return;
  
  const defaultOptions = {
    width: options.width || 280,
    margin: options.margin !== undefined ? options.margin : 2,
    color: {
      dark: options.darkColor || '#090d16',
      light: options.lightColor || '#ffffff'
    },
    errorCorrectionLevel: 'M'
  };

  try {
    await QRCode.toCanvas(canvasElement, text, defaultOptions);
  } catch (err) {
    console.error('Error rendering QR Code:', err);
  }
}

export async function getQRCodeDataURL(text, options = {}) {
  const defaultOptions = {
    width: options.width || 600,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff'
    },
    errorCorrectionLevel: 'H'
  };

  return await QRCode.toDataURL(text, defaultOptions);
}

export function downloadCanvasAsImage(canvas, filename = 'qr-code.png') {
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
