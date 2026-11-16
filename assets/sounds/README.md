// Sound files for POS system
// These are placeholder references - actual sound files should be placed in assets/sounds/

// To add real sound effects:

// 1. scan.mp3 - A short "beep" sound when scanning items
// 2. beep.mp3 - A quick confirmation beep for actions
// 3. success.mp3 - A success chime for completed transactions

// You can download free sound effects from:
// - https://www.freesound.org
// - https://mixkit.co/free-sound-effects/
// - https://pixabay.com/sound-effects/

// Recommended durations:
// - scan.mp3: 0.1-0.2 seconds
// - beep.mp3: 0.05-0.1 seconds  
// - success.mp3: 0.5-1 second

// Format: MP3, 44.1kHz, mono or stereo

// Alternative: Use Web Audio API to generate sounds programmatically
// Uncomment the following to enable synthesized sounds:

/*
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playScanSound() {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 1000;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
}

function playBeepSound() {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.05);
}

function playSuccessSound() {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
    oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
    oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2); // G5
    
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.4);
}
*/
