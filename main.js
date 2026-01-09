/**
 * Niko Niko Running - Main Application Logic
 */

class NikoRunApp {
    constructor() {
        // State
        this.isRunning = false;
        this.bpm = 180;
        this.durationMinutes = 30;
        this.timeLeft = this.durationMinutes * 60;
        this.wakeLock = null;
        this.audioContext = null;
        this.nextNoteTime = 0.0;
        this.timerInterval = null;
        this.scheduleAheadTime = 0.1;
        this.lookahead = 25.0;

        // DOM Elements
        this.els = {
            timeRemaining: document.getElementById('time-remaining'),
            startBtn: document.getElementById('start-btn'),
            currentBpm: document.getElementById('current-bpm'),
            bpmDecrease: document.getElementById('bpm-decrease'),
            bpmIncrease: document.getElementById('bpm-increase'),
            bpmSlider: document.getElementById('bpm-slider'),

            silentAudio: document.getElementById('silent-audio'),
            settingsBtn: document.getElementById('settings-btn'),
            settingsModal: document.getElementById('settings-modal'),
            closeSettings: document.getElementById('close-settings'),

            durationValue: document.getElementById('duration-value'),
            durationSlider: document.getElementById('duration-slider'),
            presetChips: document.querySelectorAll('.chip'),

            timerLabel: document.querySelector('.timer-label')
        };

        this.init();
    }

    init() {
        this.addEventListeners();
        this.updateTimeDisplay();
    }

    addEventListeners() {
        // Start/Stop
        this.els.startBtn.addEventListener('click', () => this.toggleRun());

        // BPM Controls (Buttons)
        this.els.bpmDecrease.addEventListener('click', () => {
            this.updateBpm(this.bpm - 1);
        });
        this.els.bpmIncrease.addEventListener('click', () => {
            this.updateBpm(this.bpm + 1);
        });

        // BPM Controls (Slider)
        this.els.bpmSlider.addEventListener('input', (e) => {
            this.updateBpm(parseInt(e.target.value, 10));
        });

        // Settings Modal
        this.els.settingsBtn.addEventListener('click', () => this.els.settingsModal.classList.remove('hidden'));
        this.els.closeSettings.addEventListener('click', () => {
            this.els.settingsModal.classList.add('hidden');
            // If not running, update the timer display immediately based on new duration
            if (!this.isRunning) {
                this.timeLeft = this.durationMinutes * 60;
                this.updateTimeDisplay();
            }
        });

        // Duration Controls (Slider)
        this.els.durationSlider.addEventListener('input', (e) => {
            this.updateDuration(parseInt(e.target.value, 10));
        });

        // Duration Controls (Chips)
        this.els.presetChips.forEach(chip => {
            chip.addEventListener('click', () => {
                const val = parseInt(chip.dataset.time, 10);
                this.updateDuration(val);
            });
        });

        // Handle visibility change
        document.addEventListener('visibilitychange', async () => {
            if (this.wakeLock !== null && document.visibilityState === 'visible') {
                await this.requestWakeLock();
            }
        });
    }

    updateBpm(newBpm) {
        // Clamp value
        if (newBpm < 150) newBpm = 150;
        if (newBpm > 200) newBpm = 200;

        this.bpm = newBpm;

        // Update UI
        this.els.currentBpm.textContent = this.bpm;
        this.els.bpmSlider.value = this.bpm;
    }

    updateDuration(minutes) {
        this.durationMinutes = minutes;

        // Update Slider
        this.els.durationSlider.value = minutes;
        this.els.durationValue.textContent = minutes;

        // Update Chips Active State
        this.els.presetChips.forEach(chip => {
            const chipVal = parseInt(chip.dataset.time, 10);
            if (chipVal === minutes) {
                chip.classList.add('active');
            } else {
                chip.classList.remove('active');
            }
        });
    }

    async toggleRun() {
        if (this.isRunning) {
            this.stop();
        } else {
            await this.start();
        }
    }

    async start() {
        this.els.silentAudio.play().catch(e => console.warn("Audio play failed", e));

        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        await this.requestWakeLock();

        this.isRunning = true;
        this.els.startBtn.textContent = "停止";
        this.els.startBtn.classList.add('running');
        this.els.settingsBtn.classList.add('hidden');

        if (this.timeLeft <= 0) {
            this.timeLeft = this.durationMinutes * 60;
        }

        this.nextNoteTime = this.audioContext.currentTime;
        this.scheduler();
        this.startTimer();
    }

    stop() {
        this.isRunning = false;
        this.els.startBtn.textContent = "开始运动";
        this.els.startBtn.classList.remove('running');
        this.els.settingsBtn.classList.remove('hidden');

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        if (this.wakeLock) {
            this.wakeLock.release().then(() => {
                this.wakeLock = null;
            });
        }
        this.els.silentAudio.pause();
    }

    /* --- Metronome Logic --- */
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

    /* --- Timer Logic --- */
    startTimer() {
        clearInterval(this.timerInterval);
        let lastTick = Date.now();

        this.timerInterval = setInterval(() => {
            const now = Date.now();
            const delta = now - lastTick;

            if (delta >= 1000) {
                this.timeLeft--;
                this.updateTimeDisplay();
                lastTick = now;

                if (this.timeLeft <= 10) {
                    this.els.timeRemaining.classList.add('warning-state');
                }

                if (this.timeLeft <= 0) {
                    this.finishRun();
                }
            }
        }, 100);
    }

    updateTimeDisplay() {
        const m = Math.floor(this.timeLeft / 60);
        const s = this.timeLeft % 60;
        this.els.timeRemaining.textContent = `${m}:${s.toString().padStart(2, '0')}`;

        if (this.timeLeft > 10) {
            this.els.timeRemaining.classList.remove('warning-state');
        }
    }

    finishRun() {
        this.stop();
        this.els.timeRemaining.textContent = "完成";
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
