import { identity as linear, noop, run } from './utils.js';
import { loop } from './loop.js';
import { create_rule, delete_rule } from './style_manager.js';

let promise;

function wait() {
	if (!promise) {
		promise = Promise.resolve();
		promise.then(() => {
			promise = null;
		});
	}

	return promise;
}

let outros;

export function group_outros() {
	outros = {
		remaining: 0,
		callbacks: []
	};
}

export function create_transition(node, fn, params, intro) {
	let config = fn(node, params);
	let cssText;

	let ready = !intro;
	let t = intro ? 0 : 1;

	let running = false;
	let running_program = null;
	let pending_program = null;
	let animation_name = null;

	function clear_animation() {
		if (animation_name) delete_rule(node, animation_name);
		animation_name = null;
	}

	function start(program, delay, duration, easing) {
		node.dispatchEvent(new window.CustomEvent(`${program.b ? 'intro' : 'outro'}start`));

		program.a = t;
		program.d = program.b - program.a;
		program.duration = duration * Math.abs(program.b - program.a);
		program.end = program.start + program.duration;

		if (config.css) {
			if (delay) node.style.cssText = cssText;

			clear_animation();
			animation_name = create_rule(program, easing, config.css);

			node.style.animation = (node.style.animation ? ', ' : '') + `${animation_name} ${program.duration}ms linear 1 forwards`;
		}

		running_program = program;
		pending_program = null;
	}

	function done() {
		const program = running_program;
		running_program = null;

		t = program.b;

		if (config.tick) config.tick(t, 1 - t);

		node.dispatchEvent(new window.CustomEvent(`${program.b ? 'intro' : 'outro'}end`));

		if (!program.b && !program.invalidated) {
			program.group.callbacks.push(() => {
				program.callback();
				clear_animation();
			});

			if (--program.group.remaining === 0) {
				program.group.callbacks.forEach(run);
			}
		} else {
			clear_animation();
		}

		running = !!pending_program;
	}

	function go(b, callback) {
		const {
			delay = 0,
			duration = 300,
			easing = linear
		} = config;

		const program = {
			start: window.performance.now() + delay,
			b,
			callback
		};

		if (!ready) {
			if (config.css && delay) {
				cssText = node.style.cssText;
				node.style.cssText += config.css(0, 1);
			}

			if (config.tick) config.tick(0, 1);
			ready = true;
		}

		if (!b) {
			program.group = outros;
			outros.remaining += 1;
		}

		if (delay) {
			pending_program = program;
		} else {
			start(program, delay, duration, easing);
		}

		if (!running) {
			running = true;

			loop(now => {
				if (running_program && now >= running_program.end) {
					done();
				}

				if (pending_program && now >= pending_program.start) {
					start(pending_program, delay, duration, easing);
				}

				if (running) {
					if (running_program) {
						const p = now - running_program.start;
						t = running_program.a + running_program.d * easing(p / running_program.duration);
						if (config.tick) config.tick(t, 1 - t);
					}

					return true;
				}
			});
		}
	}

	return {
		run(b, callback = noop) {
			if (typeof config === 'function') {
				wait().then(() => {
					config = config();
					go(b, callback);
				});
			} else {
				go(b, callback);
			}
		},

		abort(reset) {
			if (reset) {
				// if an outro was aborted by an intro, we need
				// to reset the node to its initial state
				if (config.tick) config.tick(1, 0);
			}

			clear_animation();

			running_program = pending_program = null;
			running = false;
		},

		invalidate() {
			// invalidation happens when a (bidirectional) outro is interrupted by an
			// intro — callbacks should not fire, as that would cause the nodes to
			// be removed from the DOM
			if (running_program) {
				running_program.invalidated = true;
			}
		}
	};
}