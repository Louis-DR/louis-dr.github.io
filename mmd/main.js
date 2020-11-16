let $ = document.querySelector.bind(document);
$('#mmd').innerHTML = localStorage.mmd;


function run() {
	let html = parse($('#mmd').value, {
        "chart":parseDiagram,
        "plot":parsePlot,
    });
    $('#formatted').innerHTML = html;

    localStorage.mmd = $('#mmd').value;

    renderMathInElement(document.body,{delimiters: [
        {left: "$$", right: "$$", display: false},
        {left: "££", right: "££", display: true}
    ]});
}

$('#mmd').oninput = run;

run();
