const spawn = require('child_process').spawn,
	exec = require('child_process').exec,
	config = require('./config.json'),
	utils = require('./utils.js'),
	defaultStreamPort = 5054,
	defaultWidth = 640,
	defaultHeight = 480,
	defaultRotation = config.rotation || 0,
	TAG = '[VideoStreamer]';

class VideoStreamer {
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
				'-r', '15',
				'-s', width + 'x' + height,
				'-i', videoDevice,
			'-f', 'mpegts',
				'-vf', this.getRotationFromDegrees(rotation),
				'-codec:v', 'mpeg1video',
					'-s', width + 'x' + height,
					'-b:v', '1000k',
				'-muxdelay', '0.001',
			'-strict', '-1',
			this.getStreamUrl(streamId, streamToken)
		];

		this.printFFmpegOptions(options);
		this.stream(options, streamId);
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
		this.stream(options, streamId);
	}

	printFFmpegOptions (options) {
		let options_str = 'ffmpeg';
		for (let i = 0; i < options.length; i++) {
			options_str += ' ' + options[i];
		}

		console.log("ffmpeg: ", options_str);
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

	stream (command, streamId) {
		this.stop(streamId).then(() => {
			console.log(TAG, 'Starting FFmpeg stream. Stream ID:', streamId);
			const ffmpegProcess = spawn('ffmpeg', command);

			ffmpegProcess.on('close', (code) => {
				console.log(TAG, `FFmpeg exited with code ${code}. Stream ID:`, streamId);
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
