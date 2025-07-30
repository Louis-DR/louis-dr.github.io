document.addEventListener('click', function(event) {
  if (event.target.classList.contains('audio')) {
    const word = event.target.textContent;
    playAudio(word);
  }
});

function playAudio(text) {
  const textProcessed = text.toLowerCase().replaceAll('/','-').replaceAll('.','').replaceAll('?','').trim();
  console.log(textProcessed)
  const soundFilePath = 'audio/' + textProcessed + '.m4a';
  const audio = new Audio(soundFilePath);
  audio.play().catch(error => {
    console.error('Error playing sound for ' + textProcessed + ':', error);
  });
}
