'use strict'
var bufferLength = 512  // number of samples to collect per frame
var circularBufferLength = 20
var triggerThreshold = 0.2
var maxV = 300
var minV = 10
var sensorDistance = 1.125
var graphTriggerColor = 'lawngreen'
var graph2UpdateInterval = 1000

// Hacks to handle vendor prefixes
navigator.getUserMedia = (navigator.getUserMedia ||
navigator.webkitGetUserMedia ||
navigator.mozGetUserMedia ||
navigator.msGetUserMedia)

window.requestAnimFrame = (function () {
  return window.requestAnimationFrame ||
  window.webkitRequestAnimationFrame ||
  window.mozRequestAnimationFrame ||
  function (callback, element) {
    window.setTimeout(callback, 1000 / 60)
  }
})()

window.AudioContext = (function () {
  return window.webkitAudioContext || window.AudioContext || window.mozAudioContext
})()

// Global Variables for Audio
var audioContext
var javascriptNode
var amplitudeArray = []    // array to hold sound data
var amplitudeArrayBuffer = new CircularBuffer(circularBufferLength)
var minValue
var maxValue

var sampleCounter = 0
var triggers = []
var shots = []
var firstTrigger
var velocities = []
var minTriggerDiff
var maxTriggerDiff
var graph2LastUpdate = Date.now()

var canvas1 = document.getElementById('canvas1')
var canvas2 = document.getElementById('canvas2')
var vReading = document.getElementById('vAvg')

try {
  audioContext = new AudioContext()
} catch (e) {
  console.err('Web Audio API is not supported in this browser')
}

var graph1 = new Rickshaw.Graph({
  element: canvas1,
  width: canvas1.offsetWidth,
  height: canvas1.offsetHeight,
  renderer: 'line',
  min: -1,
  max: 1,
  series: new Rickshaw.Series.FixedDuration([
    {name: 'threshold', color: graphTriggerColor},
    {name: 'data', color: 'white'}
  ], undefined, {
    timeInterval: 2000 / canvas1.offsetWidth,
    maxDataPoints: canvas1.offsetWidth,
    timeBase: new Date().getTime() / 1000
  })
})

var graph2 = new Rickshaw.Graph({
  element: canvas2,
  width: canvas2.offsetWidth,
  height: canvas2.offsetHeight,
  renderer: 'line',
  min: -1,
  max: 1,
  series: [
    {name: 'trigger', color: graphTriggerColor, data: [{x: 0, y: triggerThreshold}, {x: bufferLength * circularBufferLength - 1, y: triggerThreshold}]},
    {name: 'data', color: 'white', data: [{x: 0, y: 0}, {x: bufferLength * circularBufferLength - 1, y: 0}]}
  ]
})

graph1.series.addData({threshold: triggerThreshold})

drawGraph1()
graph2.render()

window.onresize = function () {
  graph1.configure({
    width: canvas1.offsetWidth,
    height: canvas1.offsetHeight
  })
  graph2.configure({
    width: canvas2.offsetWidth,
    height: canvas2.offsetHeight
  })
}

canvas1.onmousedown = mouseDownHandler
canvas2.onmousedown = mouseDownHandler
document.onmouseup = mouseUpHandler

function mouseDownHandler (e) {
  var rect = this.getBoundingClientRect()
  this.onmousemove = moveHandler
  console.log(this)
  console.log(e.clientY, rect.top)
  console.log(e.clientY - rect.top)
  console.log('mouseDown')
  console.log(e)
//  triggerThreshold = (rect.height - (e.clientY - rect.top))/rect.height;
  triggerThreshold = Math.max(0.01, (rect.height / 2 - (e.clientY - rect.top)) / (rect.height / 2))
  console.log(triggerThreshold)
}

function mouseUpHandler (e) {
  //  console.log("mouseUp")
  canvas1.onmousemove = null
  canvas2.onmousemove = null
}

function moveHandler (e) {
  console.log('mouseMove')
  var rect = this.getBoundingClientRect()
  triggerThreshold = Math.max(0.01, (rect.height / 2 - (e.clientY - rect.top)) / (rect.height / 2))
}

/*
  var iv = setInterval( function() {
  var data = { data: Math.floor(Math.random() * 40) };
  graph1.series.addData(data);
  graph1.render();
  }, 250 );
*/
navigator.mediaDevices.getUserMedia({
  video: false,
  audio: {
    channelCount: 1,
    sampleRate: 48000,
    volume: 1.0,
    echoCancellation: false
  }
}).then(setupAudioNodes).catch(onError)

function setupAudioNodes (stream) {
  var sourceNode = audioContext.createMediaStreamSource(stream)

  javascriptNode = audioContext.createScriptProcessor(bufferLength, 1, 1)

  javascriptNode.onaudioprocess = processAudio

  sourceNode.connect(javascriptNode)
  javascriptNode.connect(audioContext.destination)

  minTriggerDiff = Math.round(sensorDistance * audioContext.sampleRate / maxV)
  maxTriggerDiff = Math.round(sensorDistance * audioContext.sampleRate / minV)
  triggers = [-maxTriggerDiff]

  console.log(audioContext.sampleRate, minTriggerDiff, maxTriggerDiff)
}

function onError (e) {
  console.log(e)
}

function processAudio (audioEvent) {
  amplitudeArray = audioEvent.inputBuffer.getChannelData(0)
  amplitudeArrayBuffer.enq(amplitudeArray)
  minValue = _.min(amplitudeArray)
  maxValue = _.max(amplitudeArray)
  for (var i = 0; i < amplitudeArray.length; i++) {
    if (i + sampleCounter > firstTrigger + maxTriggerDiff) {
      firstTrigger = undefined
//      vReading.innerHTML = 'Timeout'
      console.log('Error: timeout ' + maxTriggerDiff)
//      shotsDiv.insertAdjacentHTML('afterbegin','<h2>Timeout</h2>')
      graph2.series[1].color = 'red'
      updateGraph2(amplitudeArrayBuffer.toarray())
    }
    if (amplitudeArray[i] > triggerThreshold && (i === 0 || amplitudeArray[i - 1] < triggerThreshold) && sampleCounter + i - triggers[triggers.length - 1] > minTriggerDiff) {
      if (firstTrigger === undefined) {
        console.log('first trigger')
        firstTrigger = sampleCounter + i
        triggers.push(sampleCounter + i)
      } else {
        console.log('second trigger')
        var triggerDiff = sampleCounter + i - triggers[triggers.length - 1]
        var v = sensorDistance * audioContext.sampleRate / triggerDiff
        triggers.push(sampleCounter + i)
        var rof = audioContext.sampleRate / (sampleCounter + i - shots[shots.length - 1])
        shots.push(sampleCounter + i)
//        shotsDiv.insertAdjacentHTML('afterbegin','<h2>'+v.toPrecision(3)+' fps ' + (rof > 0.1 ? rof.toPrecision(3) + " rps" : "") +'</h2>')
        velocities.push(v)
        firstTrigger = undefined
        vReading.innerHTML = v.toPrecision(3)
        graph2.series[1].color = 'white'
        updateGraph2(amplitudeArrayBuffer.toarray())
      }
    }
  }
  graph1.series.addData({data: maxValue, threshold: triggerThreshold})
  graph1.series.addData({data: minValue, threshold: triggerThreshold})
  sampleCounter += bufferLength
}

function updateGraph2 (inputArrays) {
  if (Date.now() > graph2LastUpdate + graph2UpdateInterval) {
    console.log(inputArrays.length)
    graph2.series[1].data = arraysToSeries(inputArrays.reverse())
    graph2.series[0].data = [{x: sampleCounter - bufferLength * (circularBufferLength - 1), y: triggerThreshold}, {x: sampleCounter + bufferLength - 1, y: triggerThreshold}]
    console.log(graph2.series)
    graph2.render()
    graph2LastUpdate = Date.now()
  }
}

function arraysToSeries (inputArrays) {
  var series = []
  var i = sampleCounter - bufferLength * (circularBufferLength - 1)
  for (var whichArray in inputArrays) {
    for (var arrayPos in inputArrays[whichArray]) {
      series.push({x: i, y: inputArrays[whichArray][arrayPos]})
      i++
    }
  }
  return series
}

function drawGraph1 () {
  graph1.render()
  requestAnimFrame(drawGraph1)
}
