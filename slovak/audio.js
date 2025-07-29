document.addEventListener('click', function(event) {
  if (event.target.classList.contains('audio')) {
    const word = event.target.textContent.toLowerCase().replaceAll('/','-').replaceAll('.','');
    console.log(word)
    const soundFilePath = 'audio/' + word + '.m4a';
    const audio = new Audio(soundFilePath);
    audio.play().catch(error => {
      console.error('Error playing sound for ' + word + ':', error);
    });
  }
});