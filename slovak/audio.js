// Simple global audio library wrapper
(function() {
  function sanitize(text) {
    return String(text || '')
      .replace(/\s*\([^)]*\)\s*/g, '') // Remove anything in parentheses and surrounding spaces
      .trim() // Remove leading/trailing whitespace
      .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
      .toLowerCase()
      .replaceAll('/', '-')
      .replaceAll('.', '')
      .replaceAll('?', '')
      .trim(); // Final trim after all processing
  }

  function play(text) {
    const key = sanitize(text);
    const soundFilePath = 'audio/' + key + '.m4a';
    const audio = new Audio(soundFilePath);
    return audio.play().catch(error => {
      console.error('Error playing sound for ' + key + ':', error);
    });
  }

  // Set up click handlers for elements with "audio" class
  function setupAudioClickHandlers() {
    document.querySelectorAll('.audio').forEach(element => {
      if (element.dataset.audioSetup) return; // Already set up

      element.style.cursor = 'pointer';
      element.addEventListener('click', (event) => {
        event.preventDefault();
        const text = element.textContent.trim();
        if (text) {
          play(text);
        }
      });
      element.dataset.audioSetup = 'true';
    });
  }

  // Initialize on DOM ready
  function initializeAudio() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupAudioClickHandlers);
    } else {
      setupAudioClickHandlers();
    }
  }

  // Expose global API
  window.AudioLib = {
    play,
    setupAudioClickHandlers // Allow manual re-setup if needed
  };

  // Auto-initialize
  initializeAudio();
})();
