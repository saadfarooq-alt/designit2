const fs = require('fs');
const path = require('path');
const tts = require('google-tts-api');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');

ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

const videoPath = 'C:\\My Videos\\Video Project 2.mp4';
const outputPath = 'C:\\My Videos\\Video Project 2_with_voiceover.mp4';
const tempDir = path.join(__dirname, 'temp_audio');

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// Original, detailed text spaced out evenly across the 8.5-minute video
const steps = [
  { text: "Welcome to DesignIt Studio! In this quick walkthrough, we'll show you the core features of our design canvas so you can start creating your own custom clothes and jewelry. Let's dive right in!", delay: 0 },
  { text: "First, we'll start by selecting a base template from our library on the left.", delay: 35000 },
  { text: "Next, we'll open the Tracing tool. Here, you can click on the specific paths or sections of the image you want to extract for your design.", delay: 70000 },
  { text: "Once you're happy with your selection, click 'Add to Canvas' to bring the shape into your workspace.", delay: 105000 },
  { text: "Now for the fun part! You can easily customize the garment by clicking and dragging any of the control dots along the outline.", delay: 140000 },
  { text: "Want to add custom details? Select the Pen Tool from the toolbar and draw directly onto the canvas.", delay: 175000 },
  { text: "Let's give it some style. Use the color picker to choose a new color, grab the Fill Tool, and click inside your shape to apply it instantly.", delay: 210000 },
  { text: "Made a mistake or want to refine an edge? The Erase Tool lets you easily remove parts of your drawing.", delay: 245000 },
  { text: "Remember, you can right-click on any shape to access a quick context menu for more options.", delay: 280000 },
  { text: "To see how your design looks on a body, let's add a Dress Form. You can adjust the measurements—like the bust size—to match your specific needs, then place it onto the canvas.", delay: 315000 },
  { text: "Now, right-click your garment shape and select the 'Drape' option. We'll bring the garment to the front so it sits perfectly over the dress form.", delay: 350000 },
  { text: "To get a cleaner view of your final design, you can hide the control dots and lock the canvas to prevent any accidental changes.", delay: 385000 },
  { text: "Want to start over? The Reset button clears the canvas completely. But don't worry if you change your mind—you can always use the Undo button to bring everything right back!", delay: 420000 },
  { text: "And that's it! You're now ready to bring your ideas to life with DesignIt Studio. Happy designing!", delay: 455000 }
];

function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration * 1000); // Convert to milliseconds
    });
  });
}

async function generateAudio() {
  console.log('Generating audio files...');
  const audioFiles = [];
  let lastEndTime = 0;
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const audioPath = path.join(tempDir, `step_${i}.mp3`);
    
    const url = tts.getAudioUrl(step.text, {
      lang: 'en',
      slow: false,
      host: 'https://translate.google.com',
    });
    
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(audioPath, Buffer.from(buffer));
    
    // Get duration to prevent overlapping
    const duration = await getAudioDuration(audioPath);
    
    // Ensure this audio doesn't start before the previous one finishes (plus a 200ms buffer)
    const actualDelay = Math.max(step.delay, lastEndTime + 200);
    lastEndTime = actualDelay + duration;
    
    audioFiles.push({ path: audioPath, delay: actualDelay });
    console.log(`Generated audio for step ${i} (Delay: ${actualDelay}ms, Duration: ${Math.round(duration)}ms)`);
  }
  
  return audioFiles;
}

async function mergeAudioWithVideo(audioFiles) {
  console.log('Merging audio with video...');
  
  let command = ffmpeg(videoPath);
  
  // Add all audio inputs
  audioFiles.forEach(file => {
    command = command.input(file.path);
  });
  
  // Build complex filter for mixing audio with delays
  let filterComplex = '';
  let mixInputs = '';
  
  audioFiles.forEach((file, index) => {
    // index + 1 because input 0 is the video
    const inputIndex = index + 1;
    filterComplex += `[${inputIndex}:a]adelay=${file.delay}|${file.delay}[a${index}];`;
    mixInputs += `[a${index}]`;
  });
  
  filterComplex += `${mixInputs}amix=inputs=${audioFiles.length}:normalize=0[aout]`;
  
  command
    .complexFilter(filterComplex)
    .outputOptions([
      '-map 0:v',      // Map video from first input
      '-map [aout]',   // Map mixed audio
      '-c:v copy',     // Copy video codec (no re-encoding)
      '-c:a aac',      // Encode audio to AAC
      '-shortest',     // Stop encoding when the shortest stream ends
      '-y'             // Overwrite output
    ])
    .save(outputPath)
    .on('end', () => {
      console.log(`Successfully created video with voiceover at: ${outputPath}`);
      // Cleanup temp files
      audioFiles.forEach(file => fs.unlinkSync(file.path));
      fs.rmdirSync(tempDir);
    })
    .on('error', (err) => {
      console.error('Error merging video:', err);
    });
}

async function main() {
  try {
    if (!fs.existsSync(videoPath)) {
      console.error(`Video file not found at ${videoPath}`);
      return;
    }
    
    const audioFiles = await generateAudio();
    await mergeAudioWithVideo(audioFiles);
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
