import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

let html5QrCode = null;
let isScanning = false;
let currentCameraId = null;
let hasTorch = false;
let torchOn = false;

// Audio beep using Web Audio API (zero external assets needed)
function playBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
    osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.12); // E6 note
    
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (e) {
    // Audio might be blocked until user gesture, safe to ignore
  }

  // Mobile vibration
  if (navigator.vibrate) {
    try {
      navigator.vibrate([60, 40, 60]);
    } catch (e) {
      // Ignore vibration error
    }
  }
}

export function isScannerActive() {
  return isScanning;
}

export async function startScanner({
  elementId,
  onScanSuccess,
  onScanError
}) {
  if (isScanning && html5QrCode) {
    return;
  }

  html5QrCode = new Html5Qrcode(elementId, {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    verbose: false
  });

  const config = {
    fps: 15,
    qrbox: (viewfinderWidth, viewfinderHeight) => {
      const minEdgePercentage = 0.72;
      const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
      const qrboxSize = Math.floor(minEdgeSize * minEdgePercentage);
      return {
        width: Math.min(qrboxSize, 320),
        height: Math.min(qrboxSize, 320)
      };
    },
    aspectRatio: 1.0
  };

  try {
    const cameras = await Html5Qrcode.getCameras();
    if (!cameras || cameras.length === 0) {
      throw new Error('Δεν βρέθηκε διαθέσιμη κάμερα στη συσκευή σας.');
    }

    // Prefer back / environment camera
    let selectedCamera = cameras.find(c => 
      c.label.toLowerCase().includes('back') || 
      c.label.toLowerCase().includes('rear') || 
      c.label.toLowerCase().includes('environment')
    ) || cameras[0];

    currentCameraId = selectedCamera.id;

    await html5QrCode.start(
      { facingMode: 'environment' },
      config,
      (decodedText, decodedResult) => {
        playBeep();
        if (onScanSuccess) {
          onScanSuccess(decodedText, decodedResult);
        }
      },
      (errorMessage) => {
        // Continuous non-matching frames, normal behavior
        if (onScanError) {
          onScanError(errorMessage);
        }
      }
    );

    isScanning = true;
    torchOn = false;

    // Check torch capability
    try {
      const capabilities = html5QrCode.getRunningTrackCapabilities();
      hasTorch = Boolean(capabilities && capabilities.torch);
    } catch (e) {
      hasTorch = false;
    }

    return { success: true, hasTorch };
  } catch (err) {
    isScanning = false;
    console.error('Failed to start QR scanner:', err);
    throw err;
  }
}

export async function stopScanner() {
  if (!html5QrCode) return;
  try {
    if (isScanning) {
      await html5QrCode.stop();
    }
    await html5QrCode.clear();
  } catch (err) {
    console.warn('Error stopping scanner:', err);
  } finally {
    isScanning = false;
    torchOn = false;
    hasTorch = false;
  }
}

export async function toggleTorch() {
  if (!html5QrCode || !isScanning || !hasTorch) return false;
  try {
    torchOn = !torchOn;
    await html5QrCode.applyVideoConstraints({
      advanced: [{ torch: torchOn }]
    });
    return torchOn;
  } catch (err) {
    console.warn('Failed to toggle torch:', err);
    torchOn = false;
    return false;
  }
}

export async function scanImageFile(file) {
  if (!file) throw new Error('Δεν επιλέχθηκε αρχείο εικόνας');
  
  const scanner = new Html5Qrcode('file-scanner-temp', {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    verbose: false
  });

  try {
    const decodedText = await scanner.scanFile(file, true);
    playBeep();
    return decodedText;
  } finally {
    try {
      await scanner.clear();
    } catch (e) {
      // Ignore cleanup error
    }
  }
}
