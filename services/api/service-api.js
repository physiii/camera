const noOp = () => {},
	exec = require('child_process').exec;
class ServiceApi {
	constructor (socket, service) {
		this.socket = socket;
		this.service = service;
		this.event_prefix = service.id + '::' + service.type + '::';

		this.emit = this.emit.bind(this);
		this.sendState = this.sendState.bind(this);

		// When the service's state changes, send the new state to relay.
		service.on('state-changed', this.sendState);

		this.listen();
	}

	listen () {
		this.on('settings', (data, callback) => {
			this.service.saveSettings(data.settings).then(() => callback()).catch(callback);
			exec("sleep 1;pm2 restart camera", (error, stdout, stderr) => {console.log(stdout)});
		});
	}

	on (event, localCallback) {
		this.socket.on(this.event_prefix + event, (data, remoteCallback) => {
			// Ensure callback is always a function so we don't have to check that it is anywhere else.
			const callback = typeof remoteCallback === 'function' ? remoteCallback : noOp;

			localCallback.call(this, data, callback);
		});
	}

	emit (event, data, callback) {
		this.socket.emit(this.event_prefix + event, data, callback);
	}

	sendState (data) {
		this.emit('state', {state: data.state});
	}
}

module.exports = ServiceApi;
