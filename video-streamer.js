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
	ONE_DAY_IN_HOURS = 24,
	ONE_HOUR_IN_MINUTES = 60,
	ONE_MINUTE_IN_SECONDS = 60,
	ONE_DAY_IN_MILLISECONDS = 86400000,
	ONE_HOUR_IN_MILLISECONDS = 3600000,
	ONE_MINUTE_IN_MILLISECONDS = 60000,
	ONE_SECOND_IN_MILLISECONDS = 1000,
	BUFFER_DELAY = 10 * ONE_SECOND_IN_MILLISECONDS,
	motionFileTemp = '/tmp/oa_motion_cap.avi',
	baseTempPath = '/tmp/open-automation',
	basePath = '/usr/local/lib/open-automation/camera',
	TAG = '[VideoStreamer]';

class VideoStreamer {
	constructor () {
		this.isMotionDetected = false;
		this.recordingStarted = false;
		this.id;
		this.width;
		this.height;
		this.duration;
		this.motionStartDate = new Date();
	}

	getStreamUrl (streamId, streamToken) {
		const url = config.relay_server + ':' + (config.video_stream_port || defaultStreamPort) + '/' + streamId + '/' + streamToken + '/';

		if (config.use_ssl) {
			return 'https://' + url;
		} else {
			return 'http://' + url;
		}
	}

	streamLive (streamId, streamToken, videoDevice, {
		audioDevice,
		width = defaultWidth,
		height = defaultHeight,
		rotation = defaultRotation
		} = {}) {

		// ffmpeg -s 1280x720 -r 30 -f v4l2 -i /dev/video10 -f mpegts -vf transpose=2,transpose=1 -codec:a mp2 -ar 44100 -ac 1 -b:a 128k -codec:v mpeg1video -b:v 2000k -strict -1 test.avi
		let options = [
			'-f', 'v4l2',
				'-r', '10',
				'-s', width + 'x' + height,
				'-i', videoDevice,
			'-f', 'mpegts',
				'-vf', this.getRotationFromDegrees(rotation),
				'-codec:v', 'mpeg1video',
					'-s', width + 'x' + height,
					'-b:v', '1000k',
				'-muxdelay', '0.001',
			'-strict', '-1',
			'-q:v', '0',
			this.getStreamUrl(streamId, streamToken)
		];

		this.printFFmpegOptions(options);
		this.stream(options, streamId, this.video_stream_token);
	}

	setMotionState (value) {
		this.isMotionDetected = value;
	}

	setMotionStartDate (date) {
	 this.motionStartDate = date;
	}

	startCameraCapture (buffer_1, buffer_2, audioDevice_1, audioDevice_2, videoDevice, {
		width = defaultWidth,
		height = defaultHeight,
		rotation = defaultRotation
		} = {}) {

			this.width = width;
			this.height = height;

			let options_1 = [
				'-y',
				'-loglevel', 'panic',
				'-f', 'v4l2',
					'-r', '10',
					'-s', width + 'x' + height,
					'-i', videoDevice,
				'-f', 'alsa',
					'-ar', '44100',
					// '-ac', '1',
					'-i', audioDevice_1,
					'-q:v', '0',
				buffer_1
				];

			let options_2 = [
				'-y',
				'-loglevel', 'panic',
				'-f', 'v4l2',
					'-r', '10',
					'-s', width + 'x' + height,
					'-i', videoDevice,
				'-f', 'alsa',
					'-ar', '44100',
					// '-ac', '1',
					'-i', audioDevice_2,
					'-q:v', '0',
				buffer_2
				];

		const METHOD_TAG = TAG + ' [Capture]',
			resetCaptureBuff_1 = () => {
				this.capture(options_1, buffer_1);
			},
			resetCaptureBuff_2 = () => {
				this.capture(options_2, buffer_2);
			};

		resetCaptureBuff_1();

		this.loopbackInterval = setInterval(() => {
			if (this.isMotionDetected) {
				console.log(METHOD_TAG, 'Motion Detected, continuing buffer 2.');
				this.recordingStarted = true;
			} else {
				if (this.recordingStarted) {
					this.recordingStarted = false;
					this.saveBuffer(buffer_2).then(() => {
						console.log(METHOD_TAG, 'Finished motion recording, copying buffer 2.');
					});
				} else {
					console.log(METHOD_TAG, 'No motion Detected, Re-filling buffer 1.');
					resetCaptureBuff_1();
					setTimeout(() => {

						if (this.isMotionDetected) {
							console.log(METHOD_TAG, 'Motion Detected, continuing buffer 2.');
							this.recordingStarted = true;
						} else {
							if (this.recordingStarted) {
								this.recordingStarted = false;
								this.saveBuffer(buffer_1).then(() => {
									console.log(METHOD_TAG, 'Finished motion recording, copying buffer 1.');
								});
							} else {
								console.log(METHOD_TAG, 'No motion Detected, Re-filling buffer 2.');
								resetCaptureBuff_2();
							}
						}

					}, BUFFER_DELAY / 2);
				}
			}
		}, BUFFER_DELAY);
	}

	saveBuffer (buffer) {
		return new Promise((resolve, reject) => {
			const cmd = 'cp ' + buffer + ' ' + motionFileTemp;

			console.log(TAG,cmd);
			exec(cmd, (error, stdout, stderr) => {
				if (error || stderr) {
					console.error(TAG, error, stderr);
					reject();

					return;
				}

				this.storeBuffer(this.getStoreBufferCmd()).then(() => {

					let d = new Date(),
						record = {
							id: uuid(),
							camera_id: this.id,
							date: this.motionStartDate,
							file: this.filePath,
							duration: d.getSeconds() - this.motionStartDate.getSeconds(),
							width: this.width,
							height: this.height
						}

					console.log(TAG,"Wrote buffer to disk, saving record to database.", record);
					database.set_camera_recording(record);

					resolve();
				})
			});
		})
	}

	storeBuffer(cmd) {
		return new Promise((resolve, reject) => {
			exec(cmd, (error, stdout, stderr) => {
				if (error || stderr) {
					console.error(TAG, error, stderr);
					reject();

					return;
				}
				resolve();
			});
		});
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

	printFFmpegOptions (options) {
		let options_str = 'ffmpeg';
		for (let i = 0; i < options.length; i++) {
			options_str += ' ' + options[i];
		}

		console.log(options_str);
		return options_str;
	}

	capture (command, captureId) {
		this.stopCapture(captureId).then(() => {
			// console.log(TAG, 'Starting FFmpeg capture. Capture ID:', captureId);
			const ffmpegProcess = spawn('ffmpeg', command);

			ffmpegProcess.on('close', (code) => {
				// console.log(TAG, `FFmpeg exited with code ${code}. Stream ID:`, captureId);
			});
		});
	}

	streamFile (streamId, streamToken, file) {
		this.stream([
			'-re',
			'-i', file,
			'-f', 'mpegts',
			'-codec:v', 'mpeg1video',
			'-b:v', '1200k',
			'-strict', '-1',
			this.getStreamUrl(streamId, streamToken)
		], streamId);
	}

	streamFiles (streamId, streamToken, files) {
		// TODO
	}

	stream (command, streamId, token) {
		this.stop(token).then(() => {
			console.log(TAG, 'Starting FFmpeg stream. Stream ID:', streamId);
			const ffmpegProcess = spawn('ffmpeg', command);

			ffmpegProcess.on('close', (code) => {
				console.log(TAG, `FFmpeg exited with code ${code}. Stream ID:`, streamId);
			});
		});
	}

	stopCapture (captureId) {
		return new Promise((resolve, reject) => {
			utils.checkIfProcessIsRunning('ffmpeg', captureId).then((proccess_id) => {
				if (!proccess_id) {
					resolve();

					return;
				}

				// console.log(TAG, 'Stopping FFmpeg capture. Capture ID:', captureId);

				exec('kill ' + proccess_id, (error, stdout, stderr) => {
					if (error || stderr) {
						console.error(TAG, 'Tried to kill existing FFmpeg process, but an error occurred.', error, stderr);
						reject();

						return;
					}

					resolve();
				});
			});
		});
	}

	stop (streamId) {
		return new Promise((resolve, reject) => {
			utils.checkIfProcessIsRunning('ffmpeg', streamId).then((proccess_id) => {
				if (!proccess_id) {
					resolve();

					return;
				}

				console.log(TAG, 'Stopping FFmpeg stream. Stream ID:', streamId);

				exec('kill ' + proccess_id, (error, stdout, stderr) => {
					if (error || stderr) {
						console.error(TAG, 'Tried to kill existing FFmpeg process, but an error occurred.', error, stderr);
						reject();

						return;
					}

					resolve();
				});
			});
		});
	}

	setId (id) {
			this.id = id;
	}

	getStoreBufferCmd () {
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

		this.filePath = this.getRecordPath() + '/' + fileName + '.avi';

		const cmd = 'ffmpeg -y -loglevel panic -i '
			+ motionFileTemp + ' -c copy '
			+ this.filePath;

		console.log(TAG,cmd);
		return cmd;
	}
	getRecordPath () {
		const date = this.motionStartDate,
			dd = (date.getDate() < 10 ? '0' : '') + date.getDate(),
			mm = ((date.getMonth() + 1) < 10 ? '0' : '') + (date.getMonth() + 1),
			yyyy = date.getFullYear(),
			path = basePath + '/events/' + this.id + '/' + yyyy + '/' + mm + '/' + dd;

		exec('mkdir -p ' + path);
		console.log(path);
		return path;
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
