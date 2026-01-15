/**
 * Niko Niko Running - Main Application Logic
 */

class NikoRunApp {
    constructor() {
        // State
        this.isRunning = false;
        this.bpm = 180;
        this.durationMinutes = 15; // Defaut to 15 based on first chip
        this.initialDurationSecs = this.durationMinutes * 60;
        this.timeLeft = this.initialDurationSecs;

        // Audio & System
        this.wakeLock = null;
        this.audioContext = null;
        this.nextNoteTime = 0.0;
        this.timerInterval = null;
        this.scheduleAheadTime = 0.1;
        this.lookahead = 25.0;

        // UI References
        this.els = {
            timeRemaining: document.getElementById('time-remaining'),
            playPauseArea: document.getElementById('play-pause-area'),
            iconPlay: document.getElementById('icon-play'),
            iconPause: document.getElementById('icon-pause'),
            progressRect: document.getElementById('progress-rect'),

            stopBtn: document.getElementById('stop-btn'),
            startBtn: document.getElementById('start-btn'), // Added explicitly

            bpmDisplay: document.getElementById('current-bpm'),
            bpmSlider: document.getElementById('bpm-slider'),

            chips: document.querySelectorAll('.chip'),
        };

        // Ring Calculation
        // Rect: width 280, height 180, rx 40
        // Perimeter ~= 2*(w-2r) + 2*(h-2r) + 2*PI*r
        const w = 280, h = 180, r = 40;
        this.ringPerimeter = 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;

        // Set initial stroke dasharray
        this.els.progressRect.style.strokeDasharray = `${this.ringPerimeter} ${this.ringPerimeter}`;
        this.els.progressRect.style.strokeDashoffset = 0;

        this.init();
    }

    // ... (previous methods)

    // Modified init to setup worker
    init() {
        this.setupWorker();
        this.addEventListeners();
        this.updateTimeDisplay();
        this.updateBpm(this.bpm);
        this.updateDuration(15);
    }

    setupWorker() {
        // Create worker instance
        this.timerWorker = new Worker("tm-worker.js");

        this.timerWorker.onmessage = (e) => {
            if (e.data === "tick") {
                this.scheduler();
                this.handleTimerTick();
            }
        };

        this.timerWorker.postMessage({ interval: this.lookahead });
    }

    // ... (addEventListeners, updateBpm, updateDuration, updateTimeDisplay, setProgress ... remain same)

    async start() {
        // Audio Init
        const silentAudio = document.getElementById('silent-audio');
        silentAudio.play().catch(e => console.warn("Audio play failed", e));

        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        await this.requestWakeLock();

        this.isRunning = true;
        this.updatePlayPauseUI(true);

        // If finished, reset
        if (this.timeLeft <= 0) {
            this.timeLeft = this.initialDurationSecs;
        }

        // Metronome
        this.nextNoteTime = this.audioContext.currentTime;

        // Start Worker instead of local loop
        this.timerWorker.postMessage("start");

        // Need to clear local lastTick for the timer logic
        this.lastTimerTick = Date.now();
    }

    pause() {
        this.isRunning = false;
        this.updatePlayPauseUI(false);

        // Stop Worker
        this.timerWorker.postMessage("stop");

        if (this.wakeLock) {
            this.wakeLock.release().then(() => this.wakeLock = null);
        }
    }

    stopAction() {
        this.pause();
        this.timeLeft = this.initialDurationSecs;
        this.updateTimeDisplay();
        this.setProgress(1);
    }

    // ... (updatePlayPauseUI same)

    // Replaced Scheduler Loop
    // The worker sends a 'tick' every 25ms (this.lookahead)
    // We just run the scheduling logic once per tick
    scheduler() {
        // No loop here, just check if notes need scheduling
        // while loop logic remains valid
        while (this.nextNoteTime < this.audioContext.currentTime + this.scheduleAheadTime) {
            this.scheduleNote(this.nextNoteTime);
            this.nextStep();
        }
    }

    // New Timer Handling via Worker Tick (replaces setInterval)
    handleTimerTick() {
        if (!this.isRunning) return;

        const now = Date.now();
        const delta = now - this.lastTimerTick;

        if (delta >= 1000) {
            this.timeLeft--;
            this.updateTimeDisplay();

            // Update Progress Ring
            const percent = Math.max(0, this.timeLeft / this.initialDurationSecs);
            this.setProgress(percent);

            this.lastTimerTick = now;

            if (this.timeLeft <= 0) {
                this.finishRun();
            }
        }
    }

    // ... (nextStep, scheduleNote same)

    // Removed startTimer() logic as it's now in handleTimerTick called by worker
    // Removed finishRun(), playFinishSound(), requestWakeLock() - keeping them, just standard methods

    finishRun() {
        this.pause();
        this.els.timeRemaining.textContent = "DONE";
        this.playFinishSound();
    }

    playFinishSound() {
        if (!this.audioContext) return;
        const osc = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        osc.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, this.audioContext.currentTime);
        osc.frequency.linearRampToValueAtTime(1046.5, this.audioContext.currentTime + 1);

        gainNode.gain.setValueAtTime(1, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 1);

        osc.start();
        osc.stop(this.audioContext.currentTime + 1);
    }

    async requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                this.wakeLock = await navigator.wakeLock.request('screen');
            }
        } catch (err) {
            console.error(`${err.name}, ${err.message}`);
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const app = new NikoRunApp();
});

addEventListeners() {
    // Play/Pause Toggle on Ring Click
    this.els.playPauseArea.addEventListener('click', () => this.toggleRun());

    // Start Button Click
    this.els.startBtn.addEventListener('click', () => this.toggleRun());

    // Stop Button
    this.els.stopBtn.addEventListener('click', () => this.stopAction());

    // BPM Slider
    this.els.bpmSlider.addEventListener('input', (e) => {
        this.updateBpm(parseInt(e.target.value, 10));
    });

    // Duration Chips
    this.els.chips.forEach(chip => {
        chip.addEventListener('click', () => {
            // Determine value
            const val = parseInt(chip.dataset.time, 10);
            this.updateDuration(val);
        });
    });

    // Visibility Change for Wake Lock
    document.addEventListener('visibilitychange', async () => {
        if (this.wakeLock !== null && document.visibilityState === 'visible') {
            await this.requestWakeLock();
        }
    });
}

/* --- Logic --- */

updateBpm(newBpm) {
    if (newBpm < 150) newBpm = 150;
    if (newBpm > 200) newBpm = 200;
    this.bpm = newBpm;

    this.els.bpmDisplay.textContent = this.bpm;
    this.els.bpmSlider.value = this.bpm;
}

updateDuration(minutes) {
    this.durationMinutes = minutes;
    this.initialDurationSecs = minutes * 60;

    // Visual update for chips
    this.els.chips.forEach(c => {
        if (parseInt(c.dataset.time) === minutes) c.classList.add('active');
        else c.classList.remove('active');
    });

    // If not running, reset timer immediately
    if (!this.isRunning) {
        this.timeLeft = this.initialDurationSecs;
        this.updateTimeDisplay();
        this.setProgress(1); // Full ring
    } else {
        // If running, do we restart? Or just update reference? 
        // Usually changing duration while running is tricky. 
        // Let's restart timer logic is safest, or just update the max?
        // For simplicity: if running, we stop and reset to new time to avoid confusion.
        this.stopAction();
    }
}

updateTimeDisplay() {
    const m = Math.floor(this.timeLeft / 60);
    const s = this.timeLeft % 60;
    this.els.timeRemaining.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

setProgress(percent) {
    // percent 0.0 to 1.0
    // strokeDashoffset: full length to 0
    // If percent 1.0 (100%), offset is 0. 
    // If percent 0.0 (0%), offset is perimeter.
    const offset = this.ringPerimeter - (percent * this.ringPerimeter);
    this.els.progressRect.style.strokeDashoffset = offset;
}

    async toggleRun() {
    if (this.isRunning) {
        this.pause();
    } else {
        await this.start();
    }
}

    async start() {
    // Audio Init
    const silentAudio = document.getElementById('silent-audio');
    silentAudio.play().catch(e => console.warn("Audio play failed", e));

    if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
    }

    await this.requestWakeLock();

    this.isRunning = true;
    this.updatePlayPauseUI(true);

    // If finished, reset
    if (this.timeLeft <= 0) {
        this.timeLeft = this.initialDurationSecs;
    }

    // Metronome
    this.nextNoteTime = this.audioContext.currentTime;
    this.scheduler();

    // Timer
    this.startTimer();
}

pause() {
    this.isRunning = false;
    this.updatePlayPauseUI(false);

    if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
    }
    // Don't release wake lock on simple pause? Or yes? Better to keep if user takes a break.
    // But spec says stop releases. Pause can keep it? Let's release to be safe on battery.
    if (this.wakeLock) {
        this.wakeLock.release().then(() => this.wakeLock = null);
    }
}

stopAction() {
    this.pause();
    // Reset Time
    this.timeLeft = this.initialDurationSecs;
    this.updateTimeDisplay();
    this.setProgress(1);
}

updatePlayPauseUI(isRunning) {
    // If running, show Pause icon & text
    if (isRunning) {
        this.els.iconPlay.classList.add('hidden');
        this.els.iconPause.classList.remove('hidden');
        this.els.startBtn.textContent = "暂停"; // Pause
        this.els.startBtn.classList.add('active-state');
    } else {
        this.els.iconPlay.classList.remove('hidden');
        this.els.iconPause.classList.add('hidden');
        this.els.startBtn.textContent = "开始"; // Start
        this.els.startBtn.classList.remove('active-state');
    }
}

/* --- Metronome --- */
scheduler() {
    if (!this.isRunning) return;

    while (this.nextNoteTime < this.audioContext.currentTime + this.scheduleAheadTime) {
        this.scheduleNote(this.nextNoteTime);
        this.nextStep();
    }
    setTimeout(() => this.scheduler(), this.lookahead);
}

nextStep() {
    const secondsPerBeat = 60.0 / this.bpm;
    this.nextNoteTime += secondsPerBeat;
}

scheduleNote(time) {
    const osc = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    osc.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    osc.type = 'sine';
    osc.frequency.value = 880;

    gainNode.gain.setValueAtTime(1, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    osc.start(time);
    osc.stop(time + 0.06);
}

/* --- Timer Loop --- */
startTimer() {
    clearInterval(this.timerInterval);
    let lastTick = Date.now();

    this.timerInterval = setInterval(() => {
        const now = Date.now();
        const delta = now - lastTick;

        if (delta >= 1000) {
            this.timeLeft--;
            this.updateTimeDisplay();

            // Update Progress Ring
            const percent = Math.max(0, this.timeLeft / this.initialDurationSecs);
            this.setProgress(percent);

            lastTick = now;

            if (this.timeLeft <= 0) {
                this.finishRun();
            }
        }
    }, 100);
}

finishRun() {
    this.pause();
    this.els.timeRemaining.textContent = "DONE";
    this.playFinishSound();
}

playFinishSound() {
    if (!this.audioContext) return;
    const osc = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    osc.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, this.audioContext.currentTime);
    osc.frequency.linearRampToValueAtTime(1046.5, this.audioContext.currentTime + 1);

    gainNode.gain.setValueAtTime(1, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 1);

    osc.start();
    osc.stop(this.audioContext.currentTime + 1);
}

    async requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            this.wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {
        console.error(`${err.name}, ${err.message}`);
    }
}
}

window.addEventListener('DOMContentLoaded', () => {
    const app = new NikoRunApp();
});
