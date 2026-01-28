/**
 * Niko Runner & Interval Timer App
 */

// --- Audio Controller ---
class AudioController {
    constructor() {
        this.ctx = null;
    }

    async init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
        // Silent loop for iOS background
        const silent = document.getElementById('silent-audio');
        if (silent) silent.play().catch(e => console.warn("Audio play failed", e));
    }

    getCurrentTime() {
        return this.ctx ? this.ctx.currentTime : 0;
    }

    // Metronome Tick
    scheduleTick(time) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sine';
        osc.frequency.value = 880;

        gain.gain.setValueAtTime(1, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

        osc.start(time);
        osc.stop(time + 0.06);
    }

    // Interval: Work Start (High Beep)
    playWorkBeep() {
        this.playTone(880, 0.1, 'square');
    }

    // Interval: Rest Start (Low Beep, distinct)
    playRestBeep() {
        this.playTone(330, 0.2, 'triangle');
    }

    // Finish Sound
    playFinish() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(1046.5, this.ctx.currentTime + 1);

        gain.gain.setValueAtTime(1, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1);

        osc.start();
        osc.stop(this.ctx.currentTime + 1);
    }

    playTone(freq, duration, type = 'sine') {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }
}

// --- Niko Mode Controller ---
class NikoController {
    constructor(app) {
        this.app = app;
        this.isRunning = false;
        this.bpm = 180;
        this.durationMinutes = 15;
        this.initialDurationSecs = this.durationMinutes * 60;
        this.timeLeft = this.initialDurationSecs;

        // Metronome Scheduler
        this.nextNoteTime = 0.0;
        this.scheduleAheadTime = 0.1;

        // UI Refs
        this.els = {
            view: document.getElementById('view-niko'),
            time: document.getElementById('time-remaining'),
            playArea: document.getElementById('play-pause-area'),
            iconPlay: document.getElementById('icon-play'),
            iconPause: document.getElementById('icon-pause'),
            progressRect: document.getElementById('progress-rect'),
            startBtn: document.getElementById('start-btn'),
            stopBtn: document.getElementById('stop-btn'),
            bpmSlider: document.getElementById('bpm-slider'),
            bpmDisplay: document.getElementById('current-bpm'),
            chips: document.querySelectorAll('#view-niko .chip'),
        };

        // Ring Calc
        const w = 280, h = 180, r = 40;
        this.ringPerimeter = 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;
        this.els.progressRect.style.strokeDasharray = `${this.ringPerimeter} ${this.ringPerimeter}`;
        this.els.progressRect.style.strokeDashoffset = 0;

        this.initEvents();
    }

    initEvents() {
        this.els.playArea.addEventListener('click', () => this.toggle());
        this.els.startBtn.addEventListener('click', () => this.toggle());
        this.els.stopBtn.addEventListener('click', () => this.stop());

        this.els.bpmSlider.addEventListener('input', (e) => {
            this.bpm = parseInt(e.target.value, 10);
            this.els.bpmDisplay.textContent = this.bpm;
        });

        this.els.chips.forEach(chip => {
            chip.addEventListener('click', () => {
                const val = parseInt(chip.dataset.time, 10);
                this.updateDuration(val);
            });
        });
    }

    updateDuration(mins) {
        this.durationMinutes = mins;
        this.initialDurationSecs = mins * 60;

        // Update Chips UI
        this.els.chips.forEach(c => {
            if (parseInt(c.dataset.time) === mins) c.classList.add('active');
            else c.classList.remove('active');
        });

        if (this.isRunning) this.stop();
        this.reset();
    }

    reset() {
        this.timeLeft = this.initialDurationSecs;
        this.updateTimeStr();
        this.setProgress(1);
    }

    async toggle() {
        if (this.isRunning) this.pause();
        else await this.start();
    }

    async start() {
        await this.app.requestAudio();
        await this.app.requestWakeLock();

        this.isRunning = true;
        this.updateUIState();

        if (this.timeLeft <= 0) this.reset();

        this.nextNoteTime = this.app.audio.getCurrentTime();
        this.app.startWorker();
    }

    pause() {
        this.isRunning = false;
        this.updateUIState();
        this.app.stopWorker();
        this.app.releaseWakeLock();
    }

    stop() {
        this.pause();
        this.reset();
    }

    updateUIState() {
        if (this.isRunning) {
            this.els.iconPlay.classList.add('hidden');
            this.els.iconPause.classList.remove('hidden');
            this.els.startBtn.textContent = "暂停";
            this.els.startBtn.classList.add('active-state');
        } else {
            this.els.iconPlay.classList.remove('hidden');
            this.els.iconPause.classList.add('hidden');
            this.els.startBtn.textContent = "开始";
            this.els.startBtn.classList.remove('active-state');
        }
    }

    updateTimeStr() {
        if (this.timeLeft < 0) this.timeLeft = 0;
        const m = Math.floor(this.timeLeft / 60);
        const s = this.timeLeft % 60;
        this.els.time.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    setProgress(percent) {
        const offset = this.ringPerimeter - (percent * this.ringPerimeter);
        this.els.progressRect.style.strokeDashoffset = offset;
    }

    // Called by Main App on specific interval (e.g. 25ms)
    onTick(now, delta) {
        if (!this.isRunning) return;

        // Metronome Scheduler
        while (this.nextNoteTime < this.app.audio.getCurrentTime() + this.scheduleAheadTime) {
            this.app.audio.scheduleTick(this.nextNoteTime);
            this.nextNoteTime += (60.0 / this.bpm);
        }

        // Timer Logic (1 sec)
        if (delta >= 1000) {
            this.timeLeft--;
            this.updateTimeStr();
            this.setProgress(Math.max(0, this.timeLeft / this.initialDurationSecs));

            if (this.timeLeft <= 0) {
                this.pause();
                this.els.time.textContent = "DONE";
                this.app.audio.playFinish();
            }
            return true; // returns true if 1 second tick happened
        }
        return false;
    }
}

// --- Interval Mode Controller ---
class IntervalController {
    constructor(app) {
        this.app = app;
        this.isRunning = false;

        // Settings
        this.workTime = 20;
        this.restTime = 5;
        this.totalSets = 10;

        // State
        this.phase = 'ready'; // ready, work, rest, done
        this.currentSet = 1;
        this.timeLeft = this.workTime;

        // UI
        this.els = {
            view: document.getElementById('view-interval'),
            phaseLabel: document.getElementById('int-phase-label'),
            currentSet: document.getElementById('int-current-set'),
            totalSets: document.getElementById('int-total-sets'),
            timer: document.getElementById('int-timer-display'),
            startBtn: document.getElementById('int-start-btn'),
            stopBtn: document.getElementById('int-stop-btn'),

            chipsWork: document.querySelectorAll('#chips-work .chip-sm'),
            chipsRest: document.querySelectorAll('#chips-rest .chip-sm'),

            setsMinus: document.getElementById('sets-minus'),
            setsPlus: document.getElementById('sets-plus'),
            setsDisplay: document.getElementById('sets-display'),
        };

        this.initEvents();
    }

    initEvents() {
        // Settings: Work
        this.els.chipsWork.forEach(btn => {
            btn.addEventListener('click', () => {
                this.workTime = parseInt(btn.dataset.val);
                this.updateChips(this.els.chipsWork, this.workTime);
                if (!this.isRunning) this.reset();
            });
        });

        // Settings: Rest
        this.els.chipsRest.forEach(btn => {
            btn.addEventListener('click', () => {
                this.restTime = parseInt(btn.dataset.val);
                this.updateChips(this.els.chipsRest, this.restTime);
                if (!this.isRunning) this.reset();
            });
        });

        // Settings: Sets
        this.els.setsMinus.addEventListener('click', () => {
            if (this.totalSets > 1) {
                this.totalSets--;
                this.updateSetsUI();
            }
        });
        this.els.setsPlus.addEventListener('click', () => {
            this.totalSets++;
            this.updateSetsUI();
        });

        // Controls
        this.els.startBtn.addEventListener('click', () => this.toggle());
        this.els.stopBtn.addEventListener('click', () => this.stop());
    }

    updateChips(list, val) {
        list.forEach(c => {
            if (parseInt(c.dataset.val) === val) c.classList.add('active');
            else c.classList.remove('active');
        });
    }

    updateSetsUI() {
        this.els.setsDisplay.textContent = this.totalSets;
        this.els.totalSets.textContent = this.totalSets;
    }

    reset() {
        this.phase = 'ready';
        this.currentSet = 1;
        this.timeLeft = this.workTime;
        this.updateUI();
    }

    async toggle() {
        if (this.isRunning) {
            this.pause();
        } else {
            await this.start();
        }
    }

    async start() {
        await this.app.requestAudio();
        await this.app.requestWakeLock();

        this.isRunning = true;
        this.els.startBtn.textContent = '暂停';

        if (this.phase === 'ready' || this.phase === 'done') {
            this.phase = 'work';
            this.currentSet = 1;
            this.timeLeft = this.workTime;
            this.app.audio.playWorkBeep();
        }

        this.updateUI();
        this.app.startWorker();
    }

    pause() {
        this.isRunning = false;
        this.els.startBtn.textContent = '开始';
        this.app.stopWorker();
        this.app.releaseWakeLock();
    }

    stop() {
        this.pause();
        this.reset();
    }

    updateUI() {
        this.els.currentSet.textContent = this.currentSet;
        this.els.timer.textContent = this.formatTime(this.timeLeft);

        if (this.phase === 'ready') {
            this.els.phaseLabel.textContent = "READY";
            this.els.phaseLabel.className = "status-label";
        } else if (this.phase === 'work') {
            this.els.phaseLabel.textContent = "WORK";
            this.els.phaseLabel.className = "status-label work";
        } else if (this.phase === 'rest') {
            this.els.phaseLabel.textContent = "REST";
            this.els.phaseLabel.className = "status-label rest";
        } else if (this.phase === 'done') {
            this.els.phaseLabel.textContent = "DONE";
            this.els.phaseLabel.className = "status-label work";
        }
    }

    formatTime(sec) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    onTick(now, delta) {
        if (!this.isRunning) return;

        if (delta >= 1000) {
            this.timeLeft--;
            if (this.timeLeft < 0) {
                this.nextPhase();
            } else {
                this.updateUI();
            }
            return true;
        }
        return false;
    }

    nextPhase() {
        if (this.phase === 'work') {
            // Work done -> Rest
            this.app.audio.playRestBeep();
            this.phase = 'rest';
            this.timeLeft = this.restTime;
        } else {
            // Rest done -> Next Set or Done
            if (this.currentSet >= this.totalSets) {
                // Done
                this.app.audio.playFinish();
                this.phase = 'done';
                this.pause();
            } else {
                // Next Set
                this.currentSet++;
                this.app.audio.playWorkBeep();
                this.phase = 'work';
                this.timeLeft = this.workTime;
            }
        }
        this.updateUI();
    }
}

// --- Main App ---
class App {
    constructor() {
        this.audio = new AudioController();
        this.worker = new Worker("tm-worker.js");
        this.wakeLock = null;

        this.niko = new NikoController(this);
        this.interval = new IntervalController(this);

        this.mode = 'niko'; // 'niko', 'interval'
        this.activeController = this.niko;

        this.lastTimerTick = 0;

        this.init();
    }

    init() {
        // Tab Switching
        const tabNiko = document.getElementById('tab-niko');
        const tabInterval = document.getElementById('tab-interval');

        tabNiko.addEventListener('click', () => this.switchMode('niko'));
        tabInterval.addEventListener('click', () => this.switchMode('interval'));

        // Worker Msg
        this.worker.onmessage = (e) => {
            if (e.data === "tick") {
                this.handleTick();
            }
        };
    }

    switchMode(mode) {
        if (this.mode === mode) return;

        // Stop current
        this.activeController.stop();

        // Switch
        this.mode = mode;
        this.activeController = (mode === 'niko') ? this.niko : this.interval;

        // UI Toggle
        const tabNiko = document.getElementById('tab-niko');
        const tabInterval = document.getElementById('tab-interval');
        const viewNiko = document.getElementById('view-niko');
        const viewInterval = document.getElementById('view-interval');

        if (mode === 'niko') {
            tabNiko.classList.add('active');
            tabInterval.classList.remove('active');
            viewNiko.classList.remove('hidden');
            viewInterval.classList.add('hidden');
        } else {
            tabInterval.classList.add('active');
            tabNiko.classList.remove('active');
            viewInterval.classList.remove('hidden');
            viewNiko.classList.add('hidden');
        }
    }

    async requestAudio() {
        await this.audio.init();
    }

    async requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                this.wakeLock = await navigator.wakeLock.request('screen');
            }
        } catch (err) {
            console.error(err);
        }
    }

    releaseWakeLock() {
        if (this.wakeLock) {
            this.wakeLock.release().then(() => this.wakeLock = null);
        }
    }

    startWorker() {
        this.worker.postMessage({ interval: 25.0 }); // ensure interval
        this.worker.postMessage("start");
        this.lastTimerTick = Date.now();
    }

    stopWorker() {
        this.worker.postMessage("stop");
    }

    handleTick() {
        const now = Date.now();
        const delta = now - this.lastTimerTick;

        const secondTicked = this.activeController.onTick(now, delta);

        if (secondTicked) {
            this.lastTimerTick = now;
        }
    }
}

// Start
window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
