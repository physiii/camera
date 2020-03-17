const spawn = require('child_process').spawn,
	uuid = require('uuid/v4'),
	database = require('./services/database.js'),
	exec = require('child_process').exec,
	config = require('./config.json'),
	utils = require('./utils.js'),
	defaultStreamPort = 5054,
	defaultWidth = 640,
	defaultHeight = 480,
	defaultRotation = config.rotation || 0,
	defaultPreload = 5,
	ONE_DAY_IN_HOURS = 24,
	ONE_HOUR_IN_MINUTES = 60,
	ONE_MINUTE_IN_SECONDS = 60,
	ONE_DAY_IN_MILLISECONDS = 86400000,
	ONE_HOUR_IN_MILLISECONDS = 3600000,
	ONE_MINUTE_IN_MILLISECONDS = 60000,
	ONE_SECOND_IN_MILLISECONDS = 1000,
	BUFFER_DELAY = 20 * ONE_SECOND_IN_MILLISECONDS,
	baseTempPath = '/tmp/open-automation/',
	motionVideoFileTemp = baseTempPath + 'motion_video_file.mp4',
	motionAudioFileTemp = baseTempPath + 'motion_audio_file.mp2',
	basePath = '/usr/local/lib/open-automation/camera',
	VIDEO_BUFF_1 = baseTempPath + 'video_buffer_1.mp4',
	VIDEO_BUFF_2 = baseTempPath + 'video_buffer_2.mp4',
	AUDIO_BUFF_1 = baseTempPath + 'audio_buffer_1.mp2',
	AUDIO_BUFF_2 = baseTempPath + 'audio_buffer_2.mp2',
	TAG = '[VideoStreamer]';

class VideoStreamer {
	constructor () {
		this.isMotionDetected = false;
		this.motionWasDetected = false;
		this.startRecording = false;
		this.id;
		this.width;
		this.height;
		this.duration;
		this.videoForwardDevice;
		this.videoDevice;
		this.audioDevice
		this.shouldStream = false;
		this.motionStartDate = new Date();
		this.bufferStartDate = new Date();
		this.prevBufferStartDate = new Date();
		this.streamId;
		this.videoStreamToken;
		this.audioStreamToken;
		this.bufferCommands = {};
		this.currentBuffer = [];
		this.previousBuffer = [];
		exec('mkdir -p ' + baseTempPath);
	}

	streamLive () {
			this.shouldStream = true;
			this.setBuffers()
				.then(() => console.log(TAG, 'Started streaming.'));
	}

	streamLiveAudio (streamId, streamToken, audioDevice) {
		let options = [
				'-f', 'alsa',
					'-ar', '44100',
					// '-ac', '1',
					'-i', audioDevice,
				'-f', 'mpegts',
					'-codec:a', 'mp2',
						'-b:a', '128k',
					'-muxdelay', '0.001',
				'-strict', '-1',
				this.getStreamUrl(streamId, streamToken)
				];

		this.printFFmpegOptions(options);
		this.stream(options, streamId, this.audio_stream_token);
	}

	streamFile (streamId, streamToken, file) {

		let ffmpegOptions = [
			'-re',
			'-i', file,
			'-f', 'mpegts',
			'-codec:v', 'mpeg1video',
			'-b:v', '1200k',
			'-strict', '-1',
			this.getStreamUrl(streamId, streamToken)
		];

		let ffmpegOptionsStr = this.printFFmpegOptions(ffmpegOptions);
		console.log(TAG,"ffmpegOptionsStr:",ffmpegOptionsStr);

		this.sendCommand(ffmpegOptionsStr)
		.then(() => {
			console.log(TAG, 'File finished streaming.');
		});
	}

	streamFiles (streamId, streamToken, files) {
		// TODO
	}

	stream (command, streamId, token) {
		this.shouldStream = true;
		this.setBuffers(this.bufferCommands)
			.then(() => console.log('Started streaming.'));
		// this.stop(command).then(() => {
		// 	console.log(TAG, 'Starting FFmpeg stream. Stream ID:', streamId);
		// 	const ffmpegProcess = spawn('ffmpeg', command);
		//
		// 	ffmpegProcess.on('close', (code) => {
		// 		console.log(TAG, `FFmpeg exited with code ${code}. Stream ID:`, streamId);
		// 	});
		// });
	}

	setInfo(streamId, videoStreamToken, audioStreamToken, videoDevice, videoLoopbackDevice, audioDevice) {
		this.id = streamId;
		this.streamId = streamId;
		this.videoStreamToken = videoStreamToken;
		this.audioStreamToken = audioStreamToken;
		this.videoDevice = videoDevice;
		this.videoLoopbackDevice = videoLoopbackDevice;
		this.audioDevice = audioDevice;
	}

	startCameraCapture (audioDevice, videoDevice, videoForwardDevice, {
		width = defaultWidth,
		height = defaultHeight,
		rotation = defaultRotation
		} = {}) {

		this.width = width;
		this.height = height;

		this.setBuffers()
			.then(() => console.log('Initialized buffers.'));

		this.loopbackInterval = setInterval(() => {
			if (this.isMotionDetected) {
				console.log(TAG,'Motion Detected, continuing buffer.', this.currentBuffer[this.currentBuffer.length-1]);
			} else {
				if (this.motionWasDetected) {
					this.motionWasDetected = false;
					// this.setBuffers(bufferCommands)
					// 	.then(() => this.saveBuffer(videoCommand[videoCommand.length-1], audioCommand[audioCommand.length-1]))
					// 	.then(() => console.log("Saved buffer from", videoCommand[videoCommand.length-1]));
				} else {
					this.setBuffers(this.bufferCommands)
						.then(() => console.log(TAG, 'No motion Detected, switched buffers.'));
				}
			}
		}, BUFFER_DELAY);
	}

	capture (command, captureId) {
			this.stopCapture(captureId).then(() => {
				console.log(TAG, 'Starting FFmpeg capture:', this.printFFmpegOptions(command));
				const ffmpegProcess = spawn('ffmpeg', command, {shell: true});

				ffmpegProcess.on('close', (code) => {
					console.log(TAG, `FFmpeg exited with code ${code}. Stream ID:`, captureId);
				});
			});
		}

	setVideoBuffer (videoCommand) {
		return new Promise((resolve, reject) => {
			this.sendCommand(videoCommand).then(() => {
				resolve(1);
			})
		});
	}

	setAudioBuffer (audioCommand) {
		return new Promise((resolve, reject) => {
				setTimeout(() => {
					this.sendCommand(audioCommand).then(() => {resolve(1)});
				}, 500)
		});
	}

	setBuffers () {
		return new Promise((resolve, reject) => {

			this.prevBufferStartDate = this.bufferStartDate;
			this.bufferStartDate = new Date();

			this.sendCommand('kill -15 ' + this.ffmpegPid + ' && sleep 0.4')
			.then(() => this.sendCommand(this.printFFmpegOptions(this.getBufferCommand())))
			.then(() => {
				console.log(TAG, 'Switched buffer');
			});

			setTimeout(() => {
				this.sendCommand('pidof ffmpeg')
				.then(pid => {
					this.ffmpegPid = pid.substring(0, pid.length - 1);
					resolve(0);
				});
			}, ONE_SECOND_IN_MILLISECONDS)

		});
	}

	sendCommand (command) {
		return new Promise((resolve, reject) => {
			exec(command, (error, stdout, stderr) => {
				// console.log("sendCommand", command, stdout);
				if (stderr) {
					resolve(0);
					return;
				}
				resolve(stdout);
			});
		});
	}

	stopCapture () {
			return new Promise((resolve, reject) => {

				exec('pkill ffmpeg && echo 42', (error, stdout, stderr) => {
					if (error || stderr) {
						console.error(TAG, 'Tried to kill existing FFmpeg process, but an error occurred.', error, stderr);
						resolve();

						// return;
					}

					resolve();

				});

				// utils.checkIfProcessIsRunning('ffmpeg', captureId).then((proccess_id) => {
				// 	if (!proccess_id) {
				// 		resolve();
				//
				// 		// return;
				// 	} else {
				//
				// 	// console.log(TAG, 'Stopping FFmpeg capture. Capture ID:', captureId);
				//
				//
				// }
				// });
			});
		}

	saveBuffer () {
		return new Promise((resolve, reject) => {
			// const cmd = 'cp ' + videoBuffer + ' ' + motionVideoFileTemp
			// 	+ ';' + 'cp ' + audioBuffer + ' ' + motionAudioFileTemp
			console.log(TAG,"saveBuffer: about to send command");
				this.sendCommand(this.getStoreBufferCmd()).then(() => {

					let d = new Date(),
						record = {
							id: uuid(),
							camera_id: this.id,
							date: this.motionStartDate,
							file: this.filePath,
							duration: (d.getTime() - this.motionStartDate.getTime()) / ONE_SECOND_IN_MILLISECONDS,
							width: this.width,
							height: this.height
						}

					console.log(TAG,"Wrote buffer to disk, saving record to database.", record);
					database.set_camera_recording(record);

					resolve();
				})

			// console.log(TAG,cmd);
			// exec(cmd, (error, stdout, stderr) => {
			// 	if (error || stderr) {
			// 		console.error(TAG, error, stderr);
			// 		reject();
			//
			// 		return;
			// 	}
			// });
		})
	}

	stop (streamId) {
		this.shouldStream = false;
		this.setBuffers(this.bufferCommands)
			.then(() => console.log('Stopped streaming.'));
	}

	setMotionState (value) {
		const videoCommand = this.bufferCommands.videoCommand,
			audioCommand = this.bufferCommands.audioCommand;

		this.isMotionDetected = value;

		if (value) {
			this.motionWasDetected = value;
		} else {
			console.log(TAG,"motion not detected, switch buffers then save recording.")
			this.setBuffers()
				.then(() => {
						console.log(TAG,"Saving buffer...")
						this.saveBuffer()
					})
				.then(() => console.log("Saved buffer from",	this.previousBuffer[this.previousBuffer.length -1]));
		}
	}

	setMotionStartDate (date) {
	 this.motionStartDate = date;
	 this.motionBufferStartDate = this.bufferStartDate;
	 console.log("Motion start date:",this.motionStartDate.getTime());
	}

	getFfmpegOutput (url) {


	}

	getStreamUrl (streamId, streamToken) {
		let url = config.relay_server + ':' + (config.video_stream_port || defaultStreamPort) + '/' + streamId + '/' + streamToken + '/';

		if (config.use_ssl) {
			url = 'https://' + url;
		} else {
			url = 'http://' + url;
		}

		return url;
	}

	getStoreBufferCmd () {
		let bufferFilePath = VIDEO_BUFF_1;

		if ((this.previousBuffer[this.previousBuffer.length -1]).includes(VIDEO_BUFF_2)) {
			bufferFilePath = VIDEO_BUFF_2;
		}

		let date = this.motionStartDate,
			dd = (date.getDate() < 10 ? '0' : '') + date.getDate(),

			mm = ((date.getMonth() + 1) < 10 ? '0' : '') + (date.getMonth() + 1),
			yyyy = date.getFullYear(),
			seconds = date.getTime() % 60,
			minutes = date.getTime() % (60*60),
			hours = date.getTime() % (24*60*60);

		minutes = Math.floor(minutes / 60);
		hours = Math.floor(hours / (60*60));

		hours = hours > 9 ? hours : '0' + hours;
		minutes = minutes > 9 ? minutes : '0' + minutes;
		seconds = seconds > 9 ? seconds : '0' + seconds;

		const fileName = yyyy + '-' + mm + '-' + dd + '_'
				+ hours + ':' + minutes + ':'	+ seconds;

		this.filePath = this.getRecordPath() + '/' + fileName + '.mp4';

		let start_time = (this.motionStartDate.getTime() - this.motionBufferStartDate.getTime());

		start_time = start_time / ONE_SECOND_IN_MILLISECONDS,
		start_time = start_time - defaultPreload;

		console.log("buffer started",this.motionBufferStartDate.getTime(),
			" and motion started",this.motionStartDate.getTime(),
			" so starting at", start_time
		);

		const cmd = 'ffmpeg -y -loglevel panic'
			+ ' -i ' + bufferFilePath
			+ ' -ss ' + Math.round(start_time)
			+ ' '	+ this.filePath;

		console.log(TAG,"getStoreBufferCmd", cmd);
		return cmd;
	}

	getBufferCommand () {

		let ffmpegOutput_1 = "\"" + VIDEO_BUFF_1 + "\"",
			ffmpegOutput_2 = "\""	+ VIDEO_BUFF_2 + "\"";

		if (this.shouldStream) {
			ffmpegOutput_1 = "\""
				+ VIDEO_BUFF_1
				+ "|[f=mpegts:select=a]" + this.getStreamUrl(this.id, this.audioStreamToken)
				+ "|[f=mpegts:select=v]" + this.getStreamUrl(this.id, this.videoStreamToken)
				+ "\"";

			ffmpegOutput_2 = "\""
				+ VIDEO_BUFF_2
				+ "|[f=mpegts:select=a]" + this.getStreamUrl(this.id, this.audioStreamToken)
				+ "|[f=mpegts:select=v]" + this.getStreamUrl(this.id, this.videoStreamToken)
				+ "\"";
		}

		let	command_1 = [
				'-y',
				'-loglevel', 'panic',
				'-f', 'alsa',
					'-ar', '44100',
					'-thread_queue_size', '2048',
					'-i', this.audioDevice,
				'-f', 'v4l2',
					'-s', this.width + 'x' + this.height,
					'-thread_queue_size', '1024',
					'-i', this.videoDevice,
				'-f', 'v4l2', this.videoLoopbackDevice,
				'-f', 'tee',
					'-codec:v', 'mpeg1video',
					'-q:v', '0',
					'-b:v', '900k',
					'-c:a', 'mp2',
					'-flags', '+global_header',
					'-b:a', '128k',
					'-map', '0:a',
					'-map', '1:v',
					'-r', '20',
					'-vf', this.getRotationFromDegrees(defaultRotation),
					ffmpegOutput_1
			],
			command_2 = [
				'-y',
				'-loglevel', 'panic',
				'-f', 'alsa',
					'-ar', '44100',
					'-thread_queue_size', '2048',
					'-i', this.audioDevice,
				'-f', 'v4l2',
					'-s', this.width + 'x' + this.height,
					'-thread_queue_size', '1024',
					'-i', this.videoDevice,
				'-f', 'v4l2', this.videoLoopbackDevice,
				'-f', 'tee',
					'-codec:v', 'mpeg1video',
					'-q:v', '0',
					'-b:v', '900k',
					'-c:a', 'mp2',
					'-flags', '+global_header',
					'-b:a', '128k',
					'-map', '0:a',
					'-map', '1:v',
					'-r', '20',
					'-vf', this.getRotationFromDegrees(defaultRotation),
					ffmpegOutput_2
			];

			this.previousBuffer = this.currentBuffer;

			if (this.currentBuffer[this.currentBuffer.length -1] && this.currentBuffer[this.currentBuffer.length -1].includes(VIDEO_BUFF_1)) {
				this.currentBuffer = command_2;
			} else {
				this.currentBuffer = command_1;
			}

			return this.currentBuffer;
	}

	getRecordPath () {
		const date = this.motionStartDate,
			dd = (date.getDate() < 10 ? '0' : '') + date.getDate(),
			mm = ((date.getMonth() + 1) < 10 ? '0' : '') + (date.getMonth() + 1),
			yyyy = date.getFullYear(),
			path = basePath + '/events/' + this.id + '/' + yyyy + '/' + mm + '/' + dd;

		exec('mkdir -p ' + path);
		return path;
	}

	printFFmpegOptions (options) {
		let options_str = 'ffmpeg';
		for (let i = 0; i < options.length; i++) {
			options_str += ' ' + options[i];
		}

		// console.log(options_str);
		return options_str + '';
	}

	getRotationFromDegrees (degree) {
		switch (Number(degree)) {
			case 90:
				return 'transpose=2';
			case 180:
				return 'transpose=2,transpose=2';
			case 270:
				return 'transpose=1';
			case 0:
			default:
				return 'transpose=2,transpose=1';
		}
	}
}

module.exports = new VideoStreamer();
