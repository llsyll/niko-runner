/**
 * Time Manager Worker
 * Handles timing intervals in a separate thread to prevent throttling when the main tab is inactive.
 */

let timerId = null;
let interval = 25.0; // Default tick interval in ms

self.onmessage = function (e) {
    if (e.data === "start") {
        if (!timerId) {
            timerId = setInterval(() => {
                self.postMessage("tick");
            }, interval);
        }
    } else if (e.data === "stop") {
        if (timerId) {
            clearInterval(timerId);
            timerId = null;
        }
    } else if (e.data.interval) {
        interval = e.data.interval;
        if (timerId) {
            clearInterval(timerId);
            timerId = setInterval(() => {
                self.postMessage("tick");
            }, interval);
        }
    }
};
