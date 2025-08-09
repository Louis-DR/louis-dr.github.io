// Simple global audio library wrapper
(function() {
  function sanitize(text) {
    return String(text || '')
      .toLowerCase()
      .replaceAll('/', '-')
      .replaceAll('.', '')
      .replaceAll('?', '')
      .trim();
  }

  function play(text) {
    const key = sanitize(text);
    const soundFilePath = 'audio/' + key + '.m4a';
    const audio = new Audio(soundFilePath);
    return audio.play().catch(error => {
      console.error('Error playing sound for ' + key + ':', error);
    });
  }

  window.AudioLib = { play };
})();
