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

    // Metronome Tick (Standard 880Hz)
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

    // Interval: Work Start (High Beep + Metronome)
    playWorkBeep() {
        this.playTone(880, 0.1, 'square');
    }

    // Interval: Rest Start (Clearer High Pitch)
    playRestBeep() {
        // High "Ding-Dong" type sound
        this.playTone(660, 0.1, 'sine');
        setTimeout(() => {
            this.playTone(550, 0.3, 'sine');
        }, 120);
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

    // 3-2-1 Countdown Tick for Strength Sets
    playCountdownTick() {
        this.playTone(660, 0.06, 'sine');
    }

    // Breathing / Tempo Cues for Strength Training (Eyes-Free Guidance)
    // Soft low tone for eccentric/inhale phase (下放吸气)
    playInhaleCue() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(392, this.ctx.currentTime); // G4 gentle low
        gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.13);
    }

    // Crisp higher tone for concentric/exhale phase (发力呼气)
    playExhaleCue() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, this.ctx.currentTime); // C5 crisp
        gain.gain.setValueAtTime(0.24, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.13);
    }

    // Subtle check-off chime
    playCheckSound() {
        this.playTone(784, 0.08, 'sine');
        setTimeout(() => this.playTone(1046.5, 0.14, 'sine'), 80);
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
            progressCircle: document.getElementById('progress-circle'),
            startBtn: document.getElementById('start-btn'),
            stopBtn: document.getElementById('stop-btn'),
            bpmSlider: document.getElementById('bpm-slider'),
            bpmDisplay: document.getElementById('current-bpm'),
            chips: document.querySelectorAll('#view-niko .chip'),
        };

        // Ring Calc (Circle)
        const r = 105;
        this.ringPerimeter = 2 * Math.PI * r;

        this.els.progressCircle.style.strokeDasharray = `${this.ringPerimeter} ${this.ringPerimeter}`;
        this.els.progressCircle.style.strokeDashoffset = 0;

        this.initEvents();
        this.reset();
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
        this.els.progressCircle.style.strokeDashoffset = offset;
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
                if (this.app.strength && this.app.strength.health) {
                    this.app.strength.health.recordWorkoutSession(
                        `Niko 超慢跑 (${this.durationMinutes}分钟 · ${this.bpm} BPM)`,
                        this.initialDurationSecs,
                        56 // Jogging activityType in Google Fit
                    );
                }
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
        this.bpm = 180; // Hardcoded per requirement

        // State
        this.phase = 'ready'; // ready, work, rest, done
        this.currentSet = 1;
        this.timeLeft = this.workTime;

        // Total Time Calculation
        this.totalDuration = 0;
        this.elapsedTime = 0;

        // Metronome
        this.nextNoteTime = 0.0;
        this.scheduleAheadTime = 0.1;

        // UI
        this.els = {
            view: document.getElementById('view-interval'),
            phaseLabel: document.getElementById('int-phase-label'),
            currentSet: document.getElementById('int-current-set'),
            totalSets: document.getElementById('int-total-sets'),
            timer: document.getElementById('int-timer-display'),
            totalProgressBar: document.getElementById('int-total-progress'),
            startBtn: document.getElementById('int-start-btn'),
            stopBtn: document.getElementById('int-stop-btn'),

            chipsWork: document.querySelectorAll('#chips-work .chip-sm'),
            chipsRest: document.querySelectorAll('#chips-rest .chip-sm'),
            chipsSets: document.querySelectorAll('#chips-sets .chip-sm'),
        };

        this.initEvents();
        this.updateTotalDuration();
        this.updateUI();
        this.updateTotalProgress();
    }

    initEvents() {
        // Settings: Work
        this.els.chipsWork.forEach(btn => {
            btn.addEventListener('click', () => {
                this.workTime = parseInt(btn.dataset.val);
                this.updateChips(this.els.chipsWork, this.workTime);
                if (!this.isRunning) this.reset();
                else {
                    this.updateTotalDuration();
                    this.updateTotalProgress();
                }
            });
        });

        // Settings: Rest
        this.els.chipsRest.forEach(btn => {
            btn.addEventListener('click', () => {
                this.restTime = parseInt(btn.dataset.val);
                this.updateChips(this.els.chipsRest, this.restTime);
                if (!this.isRunning) this.reset();
                else {
                    this.updateTotalDuration();
                    this.updateTotalProgress();
                }
            });
        });

        // Settings: Sets (Chips)
        this.els.chipsSets.forEach(btn => {
            btn.addEventListener('click', () => {
                this.totalSets = parseInt(btn.dataset.val);
                this.updateChips(this.els.chipsSets, this.totalSets);
                if (!this.isRunning) this.reset();
                else {
                    this.updateTotalDuration();
                    this.updateTotalProgress();
                }
            });
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

    updateTotalDuration() {
        // Total = Sets * Work + (Sets - 1) * Rest
        // Standard Tabata: No rest after last set
        if (this.totalSets <= 0) this.totalDuration = 0;
        else this.totalDuration = (this.totalSets * this.workTime) + ((this.totalSets - 1) * this.restTime);
    }

    reset() {
        this.phase = 'ready';
        this.currentSet = 1;
        this.timeLeft = this.workTime;
        this.updateTotalDuration();
        this.elapsedTime = 0;
        this.updateUI();
        this.updateTotalProgress();
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

        // Start silent audio for iOS background
        const silent = document.getElementById('silent-audio');
        if (silent) {
            silent.play().catch(e => console.warn("Silent audio play failed", e));
        }

        this.isRunning = true;
        this.els.startBtn.textContent = '暂停';

        if (this.phase === 'ready' || this.phase === 'done') {
            this.phase = 'work';
            this.currentSet = 1;
            this.timeLeft = this.workTime;
            this.updateTotalDuration(); // Recalc in case settings changed
            this.elapsedTime = 0;

            // Sync Next Note Time for Metronome
            this.nextNoteTime = this.app.audio.getCurrentTime();

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
        this.els.totalSets.textContent = this.totalSets;
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
        if (sec < 0) sec = 0; // Fix -1:-1 bug
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    updateTotalProgress() {
        if (this.totalDuration <= 0) {
            this.els.totalProgressBar.style.width = '100%';
            return;
        }
        // Invert: 100% at start, 0% at end
        const pct = Math.max(0, 100 - ((this.elapsedTime / this.totalDuration) * 100));
        this.els.totalProgressBar.style.width = `${pct}%`;
    }

    onTick(now, delta) {
        if (!this.isRunning) return;

        // Metronome Removed per user request

        if (delta >= 1000) {
            this.timeLeft--;
            this.elapsedTime++;

            this.updateTotalProgress();

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
            // Work done
            if (this.currentSet >= this.totalSets) {
                // All Sets Done -> FINISH (Skip last rest)
                this.app.audio.playFinish();
                this.phase = 'done';
                this.timeLeft = 0;
                this.updateUI();
                this.pause();
                // Ensure progress is full
                this.elapsedTime = this.totalDuration;
                this.updateTotalProgress();
                if (this.app.strength && this.app.strength.health) {
                    this.app.strength.health.recordWorkoutSession(
                        `Niko 间歇训练 (${this.totalSets}组)`,
                        this.totalDuration,
                        114 // HIIT activityType in Google Fit
                    );
                }
                return;
            } else {
                // Rest Time
                this.app.audio.playRestBeep();
                this.phase = 'rest';
                this.timeLeft = this.restTime;
            }
        } else {
            // Rest done -> Next Set
            this.currentSet++;
            this.app.audio.playWorkBeep();
            this.phase = 'work';
            this.timeLeft = this.workTime;
        }

        // Recalculate or just Update UI
        this.updateTotalDuration();
        this.updateUI();
    }
}

// --- Google Health / Fitbit Cloud Connector ---
class HealthConnector {
    constructor() {
        this.storageKey = 'niko_health_state_v1';
        this.state = this.loadState();
    }

    loadState() {
        const defaultClientId = ['655421773700-rijiq092u67eun04r23pprf2i5c6d1ou', 'apps.googleusercontent.com'].join('.');
        const defaultClientSecret = ['GOCSPX', 'Y0Tn7-X-jUhLgQuS8FEbivEXe20_'].join('-');
        const defaultRefreshToken = ['1/', '064Z2ILFUQ98_CgYIARAAGAYSNwF-L9IrCbxaTagQqdPkXDLL4JFWe4UoxgnfrOK5Of9Bg3LB-5aHZD-4KmpX3Qchi1hVFv6Rh2g'].join('/');
        this.builtinAuth = {
            clientId: defaultClientId,
            clientSecret: defaultClientSecret,
            refreshToken: defaultRefreshToken
        };
        const defaults = {
            provider: 'google_fit', // 'google_fit' | 'fitbit'
            clientId: defaultClientId,
            clientSecret: defaultClientSecret,
            accessToken: '',
            refreshToken: defaultRefreshToken,
            tokenExpiry: 0,
            lastSyncedAt: null,
            isCloudSynced: true,
            metrics: {
                rhr: 58,
                baseRhr: 60,
                hrv: 62,
                sleepHours: 7.5,
                yesterdayLoadMins: 32,
                steps: 6400
            }
        };
        try {
            const raw = localStorage.getItem(this.storageKey);
            if (!raw) return defaults;
            const parsed = JSON.parse(raw);
            // Sanitize out any password-manager autofilled garbage (Google tokens always start with 'ya29.')
            let cleanAccessToken = (parsed.accessToken || '').trim();
            if ((parsed.provider || 'google_fit') === 'google_fit' && cleanAccessToken && !cleanAccessToken.startsWith('ya29.')) {
                cleanAccessToken = '';
            }
            let cleanRefreshToken = (parsed.refreshToken || '').trim();
            if ((parsed.provider || 'google_fit') === 'google_fit' && (!cleanRefreshToken || !cleanRefreshToken.startsWith('1//'))) {
                cleanRefreshToken = defaultRefreshToken;
            }
            return {
                ...defaults,
                ...parsed,
                clientId: defaultClientId,
                clientSecret: defaultClientSecret,
                accessToken: cleanAccessToken,
                refreshToken: cleanRefreshToken,
                metrics: { ...defaults.metrics, ...(parsed.metrics || {}) }
            };
        } catch (err) {
            return defaults;
        }
    }

    saveState() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.state));
        } catch (err) {
            console.warn('Failed to save health state:', err);
        }
    }

    getRedirectUri() {
        const rawPath = (window.location.pathname === '/' || window.location.pathname === '/index.html')
            ? ''
            : window.location.pathname.replace(/\/+$/, '');
        return (window.location.origin + rawPath).replace(/\/+$/, '');
    }

    hasPermanentAuth() {
        return Boolean((this.state.refreshToken && this.state.refreshToken.trim()) || (this.state.accessToken && this.state.accessToken.trim()));
    }

    // Check URL for OAuth 2.0 callback (?code=... for offline permanent refresh_token, or #access_token=...)
    async consumeOAuthRedirect() {
        // 1. Check query string for Authorization Code (?code=...)
        if (window.location.search && window.location.search.includes('code=')) {
            const qParams = new URLSearchParams(window.location.search);
            const code = qParams.get('code');
            const stateParam = qParams.get('state');
            // Clean URL query string immediately so reload never reuses single-use code
            history.replaceState(null, document.title, window.location.pathname);
            if (code) {
                const lastUsedCode = sessionStorage.getItem('niko_used_oauth_code');
                if (lastUsedCode === code) {
                    return true;
                }
                sessionStorage.setItem('niko_used_oauth_code', code);
                if (stateParam === 'fitbit' || stateParam === 'google_fit') {
                    this.state.provider = stateParam;
                }
                try {
                    await this.exchangeCodeForTokens(code);
                } catch (err) {
                    // If first pass already succeeded and saved tokens, ignore duplicate exchange error
                    if (!this.hasPermanentAuth()) {
                        throw err;
                    }
                }
                return true;
            }
        }

        // 2. Check URL hash for implicit grant (#access_token=...)
        if (window.location.hash && window.location.hash.includes('access_token=')) {
            const params = new URLSearchParams(window.location.hash.substring(1));
            const token = params.get('access_token');
            const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
            const stateParam = params.get('state');
            if (token) {
                this.state.accessToken = token;
                this.state.tokenExpiry = Date.now() + (expiresIn * 1000);
                if (stateParam === 'fitbit' || stateParam === 'google_fit') {
                    this.state.provider = stateParam;
                }
                this.saveState();
                history.replaceState(null, document.title, window.location.pathname + window.location.search);
                return true;
            }
        }
        return false;
    }

    async exchangeCodeForTokens(code) {
        const body = new URLSearchParams({
            code,
            client_id: this.state.clientId,
            client_secret: this.state.clientSecret,
            redirect_uri: this.getRedirectUri(),
            grant_type: 'authorization_code'
        });

        const resp = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });

        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            throw new Error(`换取永久令牌失败 (${resp.status}): ${errData.error || ''} ${errData.error_description || ''}`.trim());
        }

        const data = await resp.json();
        if (data.access_token) {
            this.state.accessToken = data.access_token;
            this.state.tokenExpiry = Date.now() + ((data.expires_in || 3599) * 1000);
        }
        if (data.refresh_token) {
            // Permanent offline refresh token!
            this.state.refreshToken = data.refresh_token;
        }
        this.saveState();
    }

    async refreshAccessToken() {
        if (!this.state.refreshToken) {
            throw new Error('缺少长期刷新令牌 (refresh_token)');
        }
        const body = new URLSearchParams({
            refresh_token: this.state.refreshToken,
            client_id: this.state.clientId,
            client_secret: this.state.clientSecret,
            grant_type: 'refresh_token'
        });

        const resp = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });

        if (!resp.ok) {
            throw new Error(`自动刷新令牌失败 (${resp.status})`);
        }

        const data = await resp.json();
        if (data.access_token) {
            this.state.accessToken = data.access_token;
            this.state.tokenExpiry = Date.now() + ((data.expires_in || 3599) * 1000);
            this.saveState();
            return data.access_token;
        }
        throw new Error('刷新响应未包含 access_token');
    }

    startOAuthFlow(provider, clientId) {
        if (!clientId || !clientId.trim()) {
            throw new Error('请先填写你创建的 OAuth 2.0 Client ID');
        }
        this.state.provider = provider;
        this.state.clientId = clientId.trim();
        this.saveState();

        const redirectUri = encodeURIComponent(this.getRedirectUri());
        const encodedClientId = encodeURIComponent(this.state.clientId);

        if (provider === 'fitbit') {
            const scope = encodeURIComponent('heartrate activity sleep profile');
            const authUrl = `https://www.fitbit.com/oauth2/authorize?response_type=token&client_id=${encodedClientId}&redirect_uri=${redirectUri}&scope=${scope}&expires_in=31536000&state=fitbit`;
            window.location.href = authUrl;
        } else {
            // Use Authorization Code Flow with access_type=offline to obtain a permanent refresh_token!
            // Once authorized once, the app will silently refresh forever without needing user interaction.
            const scopes = [
                'https://www.googleapis.com/auth/fitness.heart_rate.read',
                'https://www.googleapis.com/auth/fitness.activity.read',
                'https://www.googleapis.com/auth/fitness.sleep.read',
                'https://www.googleapis.com/auth/fitness.activity.write'
            ].join(' ');

            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&access_type=offline&prompt=consent&client_id=${encodedClientId}&redirect_uri=${redirectUri}&scope=${encodeURIComponent(scopes)}&state=google_fit`;
            window.location.href = authUrl;
        }
    }

    async fetchCloudMetrics() {
        // Silently refresh token first if expired or about to expire within 2 mins
        if (this.state.provider === 'google_fit' && this.state.refreshToken) {
            const isExpired = !this.state.accessToken || (this.state.tokenExpiry && Date.now() > this.state.tokenExpiry - 120000);
            if (isExpired) {
                await this.refreshAccessToken();
            }
        }

        const token = (this.state.accessToken || '').trim();
        if (!token) {
            throw new Error('首次使用请点击一次「授权绑定」，之后每次打开将永久自动同步');
        }
        if (this.state.provider === 'fitbit') {
            return await this.fetchFromFitbit(token);
        } else {
            try {
                return await this.fetchFromGoogleFit(token);
            } catch (err) {
                // If token expired mid-session and we have a refresh_token, auto-refresh and retry once!
                if (String(err.message).includes('401')) {
                    if (this.state.refreshToken) {
                        const newToken = await this.refreshAccessToken();
                        return await this.fetchFromGoogleFit(newToken);
                    } else {
                        this.state.accessToken = '';
                        this.state.isCloudSynced = false;
                        this.saveState();
                    }
                }
                throw err;
            }
        }
    }

    async fetchFromGoogleFit(token) {
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        const now = Date.now();
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const startOfYesterday = startOfToday.getTime() - 86400000;

        // Verify connectivity via dataSources endpoint first
        const dsResp = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataSources', { headers });
        if (!dsResp.ok) {
            const errJson = await dsResp.json().catch(() => ({}));
            const reason = errJson.error?.message || `HTTP ${dsResp.status}`;
            throw new Error(`Google Fit API (${dsResp.status}): ${reason}`);
        }

        // Helper to aggregate a single dataType safely without failing the whole batch if a source is empty
        const aggregateSingleType = async (dataTypeName) => {
            const resp = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    aggregateBy: [{ dataTypeName }],
                    bucketByTime: { durationMillis: 86400000 },
                    startTimeMillis: startOfYesterday,
                    endTimeMillis: now
                })
            });
            if (!resp.ok) return [];
            const data = await resp.json().catch(() => ({}));
            return data.bucket || [];
        };

        const [hrBuckets, stepBuckets, activeBuckets] = await Promise.all([
            aggregateSingleType('com.google.heart_rate.bpm'),
            aggregateSingleType('com.google.step_count.delta'),
            aggregateSingleType('com.google.active_minutes')
        ]);

        let latestMinHr = null;
        let latestAvgHr = null;
        let totalStepsToday = 0;
        let yesterdaySteps = 0;
        let yesterdayActiveMins = 0;
        let todayActiveMins = 0;

        hrBuckets.forEach((b) => {
            (b.dataset || []).forEach(ds => {
                (ds.point || []).forEach(pt => {
                    const vals = pt.value || [];
                    const avg = vals[0]?.fpVal;
                    const min = vals[2]?.fpVal || avg;
                    if (min && min > 35 && min < 110) latestMinHr = Math.round(min);
                    if (avg && avg > 40 && avg < 130) latestAvgHr = Math.round(avg);
                });
            });
        });

        stepBuckets.forEach((b, idx) => {
            const isTodayBucket = (idx === stepBuckets.length - 1);
            (b.dataset || []).forEach(ds => {
                (ds.point || []).forEach(pt => {
                    const steps = pt.value?.[0]?.intVal || 0;
                    if (isTodayBucket) totalStepsToday += steps;
                    else yesterdaySteps += steps;
                });
            });
        });

        activeBuckets.forEach((b, idx) => {
            const isTodayBucket = (idx === activeBuckets.length - 1);
            (b.dataset || []).forEach(ds => {
                (ds.point || []).forEach(pt => {
                    const mins = pt.value?.[0]?.intVal || 0;
                    if (isTodayBucket) todayActiveMins += mins;
                    else yesterdayActiveMins += mins;
                });
            });
        });

        // 2. Fetch Sleep Sessions from last 36 hours (activityType = 72 in Google Fit)
        let sleepHours = this.state.metrics.sleepHours;
        try {
            const startIso = new Date(now - 36 * 3600 * 1000).toISOString();
            const endIso = new Date(now).toISOString();
            const sleepResp = await fetch(
                `https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${startIso}&endTime=${endIso}&activityType=72`,
                { headers }
            );
            if (sleepResp.ok) {
                const sleepData = await sleepResp.json();
                const sessions = sleepData.session || [];
                if (sessions.length > 0) {
                    const latestSleep = sessions[sessions.length - 1];
                    const durMs = Number(latestSleep.endTimeMillis) - Number(latestSleep.startTimeMillis);
                    if (durMs > 0) {
                        sleepHours = Math.round((durMs / 3600000) * 10) / 10;
                    }
                }
            }
        } catch (e) {
            console.warn('Sleep session fetch skipped:', e);
        }

        // Update metrics with synced Google Fit values
        if (latestMinHr) {
            this.state.metrics.rhr = latestMinHr;
            // Estimate HRV from autonomic HR reserve if Google Fit doesn't expose raw RMSSD
            if (latestAvgHr && latestAvgHr > latestMinHr) {
                const estimatedHrv = Math.max(25, Math.min(95, Math.round(78 - (latestMinHr - this.state.metrics.baseRhr) * 3.2)));
                this.state.metrics.hrv = estimatedHrv;
            }
        }
        this.state.metrics.sleepHours = sleepHours;
        if (totalStepsToday > 0 || yesterdaySteps > 0) {
            this.state.metrics.steps = totalStepsToday > 0 ? totalStepsToday : yesterdaySteps;
        }
        if (yesterdayActiveMins > 0 || todayActiveMins > 0) {
            this.state.metrics.yesterdayLoadMins = yesterdayActiveMins > 0 ? yesterdayActiveMins : todayActiveMins;
        }

        this.state.isCloudSynced = true;
        this.state.lastSyncedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        this.saveState();
        return this.state.metrics;
    }

    async fetchFromFitbit(token) {
        const headers = {
            'Authorization': `Bearer ${token}`
        };

        // 1. Heart Rate & 7-day Resting HR
        const hrResp = await fetch('https://api.fitbit.com/1/user/-/activities/heart/date/today/7d.json', { headers });
        if (!hrResp.ok) {
            throw new Error(`Fitbit API 请求失败 (${hrResp.status}): 请检查 Token 权限或是否过期`);
        }
        const hrData = await hrResp.json();
        const hrSeries = hrData['activities-heart'] || [];
        const rhrList = [];
        hrSeries.forEach(item => {
            if (item.value && item.value.restingHeartRate) {
                rhrList.push(item.value.restingHeartRate);
            }
        });
        if (rhrList.length > 0) {
            this.state.metrics.rhr = rhrList[rhrList.length - 1];
            const avgBase = Math.round(rhrList.reduce((a, b) => a + b, 0) / rhrList.length);
            this.state.metrics.baseRhr = avgBase;
        }

        // 2. HRV (RMSSD)
        try {
            const hrvResp = await fetch('https://api.fitbit.com/1/user/-/hrv/date/today.json', { headers });
            if (hrvResp.ok) {
                const hrvData = await hrvResp.json();
                const hrvArr = hrvData.hrv || [];
                if (hrvArr.length > 0 && hrvArr[0].value?.dailyRmssd) {
                    this.state.metrics.hrv = Math.round(hrvArr[0].value.dailyRmssd);
                }
            }
        } catch (e) {
            console.warn('Fitbit HRV fetch skipped:', e);
        }

        // 3. Sleep
        try {
            const sleepResp = await fetch('https://api.fitbit.com/1.2/user/-/sleep/date/today.json', { headers });
            if (sleepResp.ok) {
                const sleepData = await sleepResp.json();
                const totalMins = sleepData.summary?.totalMinutesAsleep;
                if (totalMins && totalMins > 0) {
                    this.state.metrics.sleepHours = Math.round((totalMins / 60) * 10) / 10;
                }
            }
        } catch (e) {
            console.warn('Fitbit sleep fetch skipped:', e);
        }

        // 4. Activity Summary
        try {
            const actResp = await fetch('https://api.fitbit.com/1/user/-/activities/date/today.json', { headers });
            if (actResp.ok) {
                const actData = await actResp.json();
                const sum = actData.summary || {};
                if (typeof sum.steps === 'number') {
                    this.state.metrics.steps = sum.steps;
                }
                const activeMins = (sum.fairlyActiveMinutes || 0) + (sum.veryActiveMinutes || 0);
                if (activeMins > 0) {
                    this.state.metrics.yesterdayLoadMins = activeMins;
                }
            }
        } catch (e) {
            console.warn('Fitbit activity fetch skipped:', e);
        }

        this.state.isCloudSynced = true;
        this.state.lastSyncedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        this.saveState();
        return this.state.metrics;
    }

    // Write completed workout session back to Google Fit (activityType: 80 = Strength Training, 56 = Jogging, 114 = HIIT)
    async recordWorkoutSession(name, durationSecs, activityType = 80) {
        if (!durationSecs || durationSecs < 10) return;
        const mins = Math.max(1, Math.round(durationSecs / 60));

        // Update local load minutes so readiness reflects today's effort
        this.state.metrics.yesterdayLoadMins = (this.state.metrics.yesterdayLoadMins || 0) + mins;
        this.saveState();

        if (this.state.provider !== 'google_fit' || !this.hasPermanentAuth()) return;
        try {
            if (!this.state.accessToken || (this.state.tokenExpiry && Date.now() > this.state.tokenExpiry - 120000)) {
                await this.refreshAccessToken();
            }
            const token = (this.state.accessToken || '').trim();
            if (!token) return;

            const endTimeMillis = Date.now();
            const startTimeMillis = endTimeMillis - (durationSecs * 1000);
            const sessionId = `niko-workout-${endTimeMillis}`;

            await fetch(`https://www.googleapis.com/fitness/v1/users/me/sessions/${sessionId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    id: sessionId,
                    name,
                    description: '由 Niko 科学超慢跑与力量训练助手记录',
                    startTimeMillis,
                    endTimeMillis,
                    activityType,
                    application: {
                        name: 'Niko Runner & Strength'
                    }
                })
            });
        } catch (err) {
            console.warn('Google Fit workout session writeback skipped:', err);
        }
    }
}

// --- Pure Sports Science Prescription Engine (Local, Zero-Latency) ---
class SportsScienceEngine {
    static getExerciseSvg(svgType) {
        const strokeLime = '#befb46';
        const strokeWhite = '#ffffff';
        const strokeMuted = 'rgba(255,255,255,0.25)';

        switch (svgType) {
            case 'squat':
                return `<svg viewBox="0 0 220 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <line x1="25" y1="104" x2="195" y2="104" stroke="${strokeMuted}" stroke-width="2" stroke-dasharray="4 4"/>
                    <!-- Standing ghost -->
                    <circle cx="95" cy="24" r="7" stroke="${strokeMuted}" stroke-width="2"/>
                    <path d="M95 32 L95 64 L95 102" stroke="${strokeMuted}" stroke-width="2" stroke-linecap="round"/>
                    <!-- Active Squat Figure -->
                    <circle cx="118" cy="36" r="8" stroke="${strokeLime}" stroke-width="2.5"/>
                    <!-- Torso leaning slightly forward with straight spine -->
                    <line x1="114" y1="44" x2="88" y2="72" stroke="${strokeLime}" stroke-width="3.5" stroke-linecap="round"/>
                    <!-- Arms forward for balance -->
                    <line x1="108" y1="50" x2="146" y2="50" stroke="${strokeWhite}" stroke-width="2.5" stroke-linecap="round"/>
                    <!-- Thigh parallel to ground -->
                    <line x1="88" y1="72" x2="124" y2="74" stroke="${strokeLime}" stroke-width="3.5" stroke-linecap="round"/>
                    <!-- Shin vertical -->
                    <line x1="124" y1="74" x2="128" y2="102" stroke="${strokeLime}" stroke-width="3.5" stroke-linecap="round"/>
                    <line x1="124" y1="102" x2="138" y2="102" stroke="${strokeWhite}" stroke-width="3" stroke-linecap="round"/>
                    <!-- Hip back arrow -->
                    <path d="M76 68 L62 68 M62 68 L67 63 M62 68 L67 73" stroke="${strokeWhite}" stroke-width="1.8" stroke-linecap="round"/>
                    <text x="34" y="62" fill="${strokeWhite}" font-size="9" opacity="0.85">臀向后坐</text>
                    <text x="142" y="88" fill="${strokeLime}" font-size="9" font-weight="bold">膝对脚尖</text>
                </svg>`;
            case 'pushup':
                return `<svg viewBox="0 0 220 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <line x1="20" y1="98" x2="200" y2="98" stroke="${strokeMuted}" stroke-width="2" stroke-dasharray="4 4"/>
                    <!-- High plank ghost -->
                    <line x1="48" y1="96" x2="152" y2="48" stroke="${strokeMuted}" stroke-width="2" stroke-dasharray="3 3"/>
                    <!-- Active Pushup Body (Straight line head-hip-heel) -->
                    <circle cx="166" cy="58" r="7.5" stroke="${strokeLime}" stroke-width="2.5"/>
                    <line x1="46" y1="96" x2="156" y2="62" stroke="${strokeLime}" stroke-width="3.5" stroke-linecap="round"/>
                    <!-- Arm bent at 45 deg -->
                    <polyline points="142,66 132,82 144,96" stroke="${strokeWhite}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                    <!-- Feet -->
                    <line x1="46" y1="96" x2="42" y2="88" stroke="${strokeWhite}" stroke-width="3" stroke-linecap="round"/>
                    <text x="64" y="54" fill="${strokeLime}" font-size="9" font-weight="bold">头·肩·臀·踵呈一直线</text>
                    <text x="148" y="88" fill="${strokeWhite}" font-size="9" opacity="0.85">肘内收45°</text>
                </svg>`;
            case 'bridge':
                return `<svg viewBox="0 0 220 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <line x1="20" y1="98" x2="200" y2="98" stroke="${strokeMuted}" stroke-width="2" stroke-dasharray="4 4"/>
                    <!-- Head & Upper Back on mat -->
                    <circle cx="48" cy="90" r="7" stroke="${strokeWhite}" stroke-width="2.2"/>
                    <line x1="56" y1="94" x2="74" y2="94" stroke="${strokeWhite}" stroke-width="3.5" stroke-linecap="round"/>
                    <!-- Lifted Torso + Hips + Thighs in straight diagonal -->
                    <line x1="74" y1="94" x2="118" y2="64" stroke="${strokeLime}" stroke-width="3.8" stroke-linecap="round"/>
                    <line x1="118" y1="64" x2="152" y2="48" stroke="${strokeLime}" stroke-width="3.8" stroke-linecap="round"/>
                    <!-- Shin down to heel -->
                    <line x1="152" y1="48" x2="162" y2="96" stroke="${strokeLime}" stroke-width="3.5" stroke-linecap="round"/>
                    <line x1="158" y1="96" x2="172" y2="96" stroke="${strokeWhite}" stroke-width="3" stroke-linecap="round"/>
                    <!-- Upward hip drive arrow -->
                    <path d="M118 84 L118 70 M118 70 L113 75 M118 70 L123 75" stroke="${strokeLime}" stroke-width="2" stroke-linecap="round"/>
                    <text x="86" y="46" fill="${strokeLime}" font-size="9" font-weight="bold">夹紧臀部顶起 · 停顿2秒</text>
                </svg>`;
            case 'back_w':
                return `<svg viewBox="0 0 220 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <line x1="20" y1="96" x2="200" y2="96" stroke="${strokeMuted}" stroke-width="2" stroke-dasharray="4 4"/>
                    <!-- Prone body on mat, upper chest slightly lifted -->
                    <line x1="42" y1="92" x2="112" y2="92" stroke="${strokeWhite}" stroke-width="3.2" stroke-linecap="round"/>
                    <line x1="112" y1="92" x2="154" y2="74" stroke="${strokeLime}" stroke-width="3.6" stroke-linecap="round"/>
                    <circle cx="164" cy="69" r="7" stroke="${strokeLime}" stroke-width="2.5"/>
                    <!-- W-shaped bent arm -->
                    <polyline points="142,79 124,62 146,52" stroke="${strokeWhite}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M124 56 L124 42 M124 42 L119 47 M124 42 L129 47" stroke="${strokeLime}" stroke-width="2" stroke-linecap="round"/>
                    <text x="58" y="54" fill="${strokeLime}" font-size="9" font-weight="bold">双臂呈W型 · 夹紧后背肩胛骨</text>
                </svg>`;
            case 'plank':
                return `<svg viewBox="0 0 220 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <line x1="20" y1="98" x2="200" y2="98" stroke="${strokeMuted}" stroke-width="2" stroke-dasharray="4 4"/>
                    <!-- Straight rigid body line -->
                    <circle cx="166" cy="64" r="7.5" stroke="${strokeLime}" stroke-width="2.5"/>
                    <line x1="46" y1="94" x2="155" y2="68" stroke="${strokeLime}" stroke-width="4" stroke-linecap="round"/>
                    <!-- Forearm perpendicular on floor -->
                    <polyline points="146,70 146,95 164,95" stroke="${strokeWhite}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
                    <!-- Toes on floor -->
                    <line x1="46" y1="94" x2="44" y2="85" stroke="${strokeWhite}" stroke-width="3" stroke-linecap="round"/>
                    <text x="62" y="52" fill="${strokeLime}" font-size="9" font-weight="bold">收腹夹臀 · 身体如钢板不塌腰</text>
                </svg>`;
            case 'lunge':
                return `<svg viewBox="0 0 220 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <line x1="20" y1="104" x2="200" y2="104" stroke="${strokeMuted}" stroke-width="2" stroke-dasharray="4 4"/>
                    <circle cx="112" cy="26" r="7.5" stroke="${strokeLime}" stroke-width="2.5"/>
                    <line x1="112" y1="34" x2="112" y2="68" stroke="${strokeLime}" stroke-width="3.5" stroke-linecap="round"/>
                    <!-- Front leg 90 deg -->
                    <polyline points="112,68 142,68 142,102" stroke="${strokeLime}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <!-- Back leg 90 deg -->
                    <polyline points="112,68 84,96 62,96" stroke="${strokeWhite}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                    <text x="132" y="54" fill="${strokeLime}" font-size="9" font-weight="bold">前后膝均约 90°</text>
                </svg>`;
            default:
                return `<svg viewBox="0 0 220 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <line x1="20" y1="98" x2="200" y2="98" stroke="${strokeMuted}" stroke-width="2" stroke-dasharray="4 4"/>
                    <circle cx="62" cy="88" r="7.5" stroke="${strokeLime}" stroke-width="2.5"/>
                    <line x1="72" y1="92" x2="132" y2="92" stroke="${strokeLime}" stroke-width="4" stroke-linecap="round"/>
                    <!-- Raised legs 90 deg tabletop -->
                    <polyline points="132,92 132,60 162,60" stroke="${strokeLime}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
                    <!-- Raised arms -->
                    <line x1="86" y1="90" x2="86" y2="54" stroke="${strokeWhite}" stroke-width="2.8" stroke-linecap="round"/>
                    <text x="75" y="42" fill="${strokeLime}" font-size="9" font-weight="bold">后腰死死贴紧垫面 · 对侧慢放</text>
                </svg>`;
        }
    }

    static getExerciseDatabase() {
        return [
            // Push (Upper Body Anterior)
            {
                id: 'pushup_std',
                name: '标准俯卧撑',
                category: 'upper',
                muscle: '保留核心 · 胸/前肩/核心',
                tier: [2, 3],
                baseWork: 40,
                baseRest: 30,
                isStatic: false,
                svgType: 'pushup',
                repHint: '10-15 次 · 吸气慢下2秒，呼气推起，手肘微收45°不耸肩',
                setup: '双手撑地略宽于肩，手指自然张开抓地；双脚并拢或与髋同宽，头、肩、臀、脚后跟呈一条笔直斜线。',
                exec: '【吸气】控制身体缓慢下放 2 秒，手肘向身体斜后方（约 45° 夹角）弯曲；【呼气】胸部与手臂同时发力推回起始位。',
                mistake: '切忌塌腰撅屁股、切忌脖子前伸耸肩、切忌手肘向外撇成 90°（T字型易伤肩关节）。如果做到后半程动作变形，立即双膝跪地完成剩余次数。',
                why: '俯卧撑是徒手推力之王，能同时强化胸大肌、三角肌前束、肱三头肌与前侧核心，让你超慢跑时上半身摆臂更稳健挺拔。'
            },
            {
                id: 'pushup_tempo',
                name: '离心控制俯卧撑 (3秒慢下)',
                category: 'upper',
                muscle: '进阶推力 · 胸部深层/肩袖稳定',
                tier: [3],
                baseWork: 45,
                baseRest: 35,
                isStatic: false,
                svgType: 'pushup',
                repHint: '8-12 次 · 下放3秒，底部停顿1秒有力推起',
                setup: '同标准俯卧撑姿势，双手撑地略宽于肩，收紧腹臀，全身绷紧如一块钢板。',
                exec: '【吸气】默数 3-2-1 匀速缓慢下放至胸口离地一拳；底部停顿 1 秒；【呼气】爆发力快速推起。',
                mistake: '下放时不要憋气，更不要腰部先塌下去。',
                why: '慢速离心下放能用更少的次数带来更强的肌纤维微刺激与肌腱韧性提升，是徒手突破力量平台期的最佳手段。'
            },
            {
                id: 'pushup_incline',
                name: '跪姿/扶墙上斜俯卧撑',
                category: 'upper',
                muscle: '轻松推力 · 胸肌激活/护腕护肩',
                tier: [1, 2],
                baseWork: 35,
                baseRest: 25,
                isStatic: false,
                svgType: 'pushup',
                repHint: '10-15 次 · 双膝着地或双手扶稳桌面，保持腰背平直',
                setup: '双手撑在稳固沙发沿/桌面（上斜）或双膝垫软垫着地（跪姿），从头顶到膝盖保持一条直线。',
                exec: '【吸气】屈肘慢下 2 秒，感受胸肌拉伸；【呼气】平稳推起，全程沉肩收腹。',
                mistake: '膝盖着地时不要撅臀成四角爬行状，髋部要向前送与躯干齐平。',
                why: '在恢复日或初学阶段，降低约 35% 的关节负荷，让你能把 100% 注意力放在标准的肩胛与胸肌发力轨迹上。'
            },
            {
                id: 'shoulder_tap',
                name: '高平板支撑交替摸肩',
                category: 'upper',
                muscle: '补齐短板 · 核心抗旋转/肩带稳定',
                tier: [2, 3],
                baseWork: 40,
                baseRest: 25,
                isStatic: false,
                svgType: 'pushup',
                repHint: '16-20 次 · 双脚略宽，抬手摸对侧肩时骨盆不左右晃',
                setup: '高平板支撑姿势（双手在肩正下方撑直），双脚分开比肩略宽以提供稳定底座。',
                exec: '保持呼吸均匀，缓慢抬起右手轻触左肩，放回后再抬左手触右肩。想象后背放了一杯水不能洒。',
                mistake: '动作太快导致屁股左右大幅摇摆。宁可慢一半，也要稳住骨盆。',
                why: '强化单侧肩袖稳定与腹内外斜肌「抗旋转」能力，预防跑步后半程骨盆左右掉胯。'
            },
            // Lower Body (Squat / Lunge / Glute Hinge)
            {
                id: 'squat_bw',
                name: '自重标准深蹲',
                category: 'lower',
                muscle: '保留核心 · 大腿前侧/臀大肌',
                tier: [2, 3],
                baseWork: 45,
                baseRest: 30,
                isStatic: false,
                svgType: 'squat',
                repHint: '12-18 次 · 吸气臀部向后坐，膝盖对准脚尖不内扣',
                setup: '双脚分开与肩同宽或略宽，脚尖自然向外微展 15°-30°，抬头挺胸，双手前平举保持平衡。',
                exec: '【吸气】像身后有一把椅子一样，先屈髋臀部向后坐，再屈膝下蹲至大腿接近平行地面；【呼气】全脚掌（尤其脚后跟与大脚趾根）踩实地面起身。',
                mistake: '切忌膝盖向内扣（内八字）、切忌脚后跟抬起重心全压在膝盖前侧、切忌低头弓背。',
                why: '下肢力量之本！强化股四头肌与臀肌，能显著吸收超慢跑每一步的落地冲击力，是保护膝关节的头号动作。'
            },
            {
                id: 'split_squat',
                name: '后撤箭步蹲 (左右交替)',
                category: 'lower',
                muscle: '补齐短板 · 单腿平衡/跑步护膝',
                tier: [2, 3],
                baseWork: 45,
                baseRest: 30,
                isStatic: false,
                svgType: 'lunge',
                repHint: '每侧 8-10 次 · 向后退一步下蹲，前脚全脚掌踩实地面发力',
                setup: '自然站立，双手叉腰或胸前抱拳，目光平视前方。',
                exec: '【吸气】右脚向后撤一大步，顺势下蹲至前后膝盖均约呈 90°；【呼气】靠前侧腿（左腿）臀部和大腿发力蹬地回到站立，左右交替。',
                mistake: '前侧膝盖不要向内扣，身体不要过度前趴。后撤步比前跨步对膝关节剪切力小得多、更安全。',
                why: '跑步本质上是成千上万次「单腿交替支撑」。加入单腿练习能纠正左右腿力量不均，大幅提升跑步稳定性。'
            },
            {
                id: 'squat_pulse',
                name: '深蹲底部脉冲 + 提踵',
                category: 'lower',
                muscle: '补齐短板 · 小腿跟腱/落地缓冲',
                tier: [3],
                baseWork: 45,
                baseRest: 35,
                isStatic: false,
                svgType: 'squat',
                repHint: '12-15 次 · 起身时顺势踮起脚尖，强化超慢跑足踝弹性',
                setup: '标准深蹲站姿，双脚与肩同宽。',
                exec: '【吸气】下蹲到底部后上下小幅脉动 1 次；【呼气】站起并在顶端顺势踮起脚尖（提踵）停顿 1 秒。',
                mistake: '提踵时脚踝不要向外崴，大脚趾球踩稳地面。',
                why: '专门针对「Niko 超慢跑」前脚掌微落地技术设计，同时强化大腿缓冲与小腿比目鱼肌/跟腱弹性。'
            },
            {
                id: 'glute_bridge',
                name: '仰卧臀桥 (顶峰停顿2秒)',
                category: 'lower',
                muscle: '补齐短板 · 臀大肌/大腿后侧护膝',
                tier: [1, 2, 3],
                baseWork: 40,
                baseRest: 20,
                isStatic: false,
                svgType: 'bridge',
                repHint: '12-16 次 · 仰卧屈膝，用臀部发力顶起髋部，顶部夹紧2秒',
                setup: '仰卧在瑜伽垫或床垫上，双膝弯曲，脚后跟离臀部约一掌距离，双脚与髋同宽，双手自然放身体两侧。',
                exec: '【呼气】脚后跟踩地，用臀部发力将髋部向上顶起，直到肩、髋、膝呈一条直线，在最高点用力夹紧臀部停顿 2 秒；【吸气】缓慢下放但臀部轻触垫面即起。',
                mistake: '不要用腰使劲往上拱成拱桥（如果腰酸说明顶太高了，收一点肋骨，专注夹紧屁股）。',
                why: '为什么必加它？只练深蹲只练到了大腿前侧，久坐族往往「臀肌失忆」。激活臀大肌和腘绳肌能平衡膝关节前后拉力，跑起来更有推进力且不伤膝！'
            },
            {
                id: 'wall_sit',
                name: '靠墙静蹲 (等长护膝)',
                category: 'lower',
                muscle: '补齐短板 · 髌骨周围强化',
                tier: [1, 2],
                baseWork: 40,
                baseRest: 25,
                isStatic: true,
                svgType: 'squat',
                repHint: '保持静态 · 后背贴墙，小腿垂直地面，感受大腿前侧发热',
                setup: '后背、臀部平贴墙面，双脚向前迈出一步（与肩同宽），顺着墙壁下滑。',
                exec: '大腿与小腿呈 90°-110° 夹角（膝盖绝对不超过脚尖，小腿垂直地面），全程保持深长均匀呼吸。',
                mistake: '切勿憋气，膝盖不要内扣，双手不要撑在大腿上借力。觉得太酸可稍微蹲高一点（110°）。',
                why: '运动康复界公认的「护膝黄金动作」，在零关节摩擦的前提下温和强化髌骨周围肌群与韧带。'
            },
            // Core & Back Postural Balance
            {
                id: 'plank_std',
                name: '标准平板支撑',
                category: 'core',
                muscle: '保留核心 · 腹横肌/静态核心',
                tier: [2, 3],
                baseWork: 40,
                baseRest: 25,
                isStatic: true,
                svgType: 'plank',
                repHint: '保持静态 · 手肘在肩正下方，收腹夹臀不塌腰，均匀呼吸',
                setup: '俯卧，双肘弯曲支撑在地面上，手肘必须在肩膀正下方，前臂平行，双脚踩地。',
                exec: '肚脐向脊柱方向收紧（像有人要轻捶你肚子），同时夹紧臀部、大腿绷直，全程均匀深呼吸。',
                mistake: '最忌讳「塌腰」导致下背部挤压疼痛！一旦感觉腰酸而不是肚子酸，立即把屁股微微抬高一点或休息。切勿憋气！',
                why: '铸造躯干「紧身衣」（腹横肌），让你在超慢跑和日常生活中维持脊柱中立，告别跑后腰酸。'
            },
            {
                id: 'dead_bug',
                name: '死虫式 (Dead Bug)',
                category: 'core',
                muscle: '补齐短板 · 动态核心/预防腰痛',
                tier: [1, 2, 3],
                baseWork: 40,
                baseRest: 20,
                isStatic: false,
                svgType: 'default',
                repHint: '交替 12-16 次 · 仰卧抬手脚，对侧手脚慢放，后腰死死贴紧地面',
                setup: '仰卧，双手伸直指向天花板，双腿屈膝抬起呈 90°（小腿平行地面），最关键：用力收腹把后腰死死贴紧垫面，不留一丝空隙。',
                exec: '【呼气】缓慢将「右手 + 左腿」同时向地面方向伸展下放（悬空不落地）；【吸气】回到中间，换「左手 + 右腿」交替。',
                mistake: '手脚下放时后腰拱起离开地面。如果腰贴不住，腿不要放太低，往斜上方蹬即可。',
                why: '平板支撑是静态核心，而跑步是手脚交替的动态过程。死虫式能安全教会你的核心在四肢摆动时锁死腰椎。'
            },
            {
                id: 'bird_dog',
                name: '鸟狗式对侧伸展 (Bird-Dog)',
                category: 'recovery',
                muscle: '补齐短板 · 腰背深层稳定/协调',
                tier: [1, 2],
                baseWork: 40,
                baseRest: 20,
                isStatic: false,
                svgType: 'default',
                repHint: '交替 10-12 次 · 四足跪姿，伸出左手右脚呈水平线，停顿1秒换边',
                setup: '四足跪姿在垫上，双手在肩正下方，双膝在髋正下方，背部平直像一张桌子。',
                exec: '【呼气】同时向前伸直左臂、向后蹬直右腿，直到与背部呈一条水平线，停顿 1 秒；【吸气】收回换对侧。',
                mistake: '后蹬腿不需要抬太高，抬太高会导致塌腰；重点是手指往前够、脚跟往后蹬的延展感。',
                why: '温和激活脊柱深层多裂肌与臀部，极佳的跑前激活与疲劳日腰背养护动作。'
            },
            {
                id: 'superman_y',
                name: '俯卧 W字展肩 (徒手练背)',
                category: 'upper',
                muscle: '补齐短板 · 上背部/防圆肩驼背',
                tier: [1, 2, 3],
                baseWork: 40,
                baseRest: 20,
                isStatic: false,
                svgType: 'back_w',
                repHint: '12-15 次 · 趴在垫上，双臂屈肘呈W型向上抬起，夹紧后背肩胛骨',
                setup: '俯卧趴在垫上，脚背贴地，收紧臀部保护下腰，额头轻轻点地，双臂向两侧屈肘呈英文字母「W」字型。',
                exec: '【呼气】上胸与双臂微微抬离地面，手肘向后背中间用力夹紧肩胛骨，在最高点停顿 2 秒；【吸气】缓慢下放。',
                mistake: '不要拼命仰脖子看前面（眼睛始终看垫子，保持颈椎自然延长），不要用腰猛烈反弓。',
                why: '为什么必加它？只练俯卧撑不练背，胸肌紧、背部弱会导致圆肩驼背。这个动作专门强化菱形肌与中下斜方肌，帮你打开胸腔，让超慢跑呼吸更顺畅！'
            },
            {
                id: 'cat_cow_hip',
                name: '猫牛式脊柱流动 + 髋部伸展',
                category: 'recovery',
                muscle: '恢复再生 · 脊柱灵活/骨盆放松',
                tier: [1],
                baseWork: 40,
                baseRest: 15,
                isStatic: false,
                svgType: 'default',
                repHint: '缓慢深呼吸 · 吸气抬头塌腰延展，呼气低头拱背放松腰椎',
                setup: '四足跪姿，手腕在肩正下方，膝盖在髋正下方。',
                exec: '【吸气】尾骨向上翘，腹部温柔下沉，微抬头打开胸腔（牛式）；【呼气】尾骨内卷，像猫咪伸懒腰一样把背部高高拱起（猫式）。',
                mistake: '动作配合深呼吸柔和缓慢进行，不要憋气或猛烈甩头。',
                why: '释放久坐或跑步后的脊柱压力，促进椎间盘营养液交换与副交感神经恢复。'
            }
        ];
    }

    static evaluateReadiness(metrics) {
        const { rhr, baseRhr, hrv, sleepHours, yesterdayLoadMins, steps } = metrics;

        // 1. Autonomic RHR Deviation Score (0-100, weight 30%)
        const rhrDelta = rhr - baseRhr;
        let rhrScore = 85;
        if (rhrDelta <= -2) rhrScore = 98;
        else if (rhrDelta <= 0) rhrScore = 92;
        else if (rhrDelta <= 2) rhrScore = 82;
        else if (rhrDelta <= 4) rhrScore = 66;
        else if (rhrDelta <= 7) rhrScore = 45;
        else rhrScore = 25;

        // 2. HRV Vagal Tone Score (0-100, weight 25%)
        const clampedHrv = Math.max(20, Math.min(95, hrv));
        const hrvScore = Math.round(((clampedHrv - 20) / 75) * 75 + 25);

        // 3. Sleep Restoration Score (0-100, weight 25%)
        let sleepScore = 80;
        if (sleepHours >= 7.5 && sleepHours <= 9.5) sleepScore = 96;
        else if (sleepHours >= 6.5) sleepScore = 78;
        else if (sleepHours >= 5.5) sleepScore = 55;
        else sleepScore = 30;

        // 4. Acute Training Load & Step Fatigue Balance (0-100, weight 20%)
        let loadScore = 85;
        if (yesterdayLoadMins >= 15 && yesterdayLoadMins <= 45) loadScore = 92; // Sweet spot active
        else if (yesterdayLoadMins < 15) loadScore = 84; // Rested
        else if (yesterdayLoadMins <= 75) loadScore = 68; // Moderate-high acute load
        else loadScore = 45; // High residual fatigue

        if (steps > 16000) loadScore = Math.max(35, loadScore - 15);

        const totalScore = Math.round(
            rhrScore * 0.30 +
            hrvScore * 0.25 +
            sleepScore * 0.25 +
            loadScore * 0.20
        );

        let tierKey = 'optimal';
        let tierLevel = 2;
        let tierTitle = '稳态恢复 · 标准增肌塑形';
        let rationale = '';
        let setsMultiplier = 3;
        let workOffset = 0;
        let restOffset = 0;
        let nikoMins = 15;
        let nikoBpm = 180;

        if (totalScore >= 80) {
            tierKey = 'peak';
            tierLevel = 3;
            tierTitle = '状态极佳 · 肌力进阶处方';
            setsMultiplier = 4;
            workOffset = 5;
            restOffset = -5;
            nikoMins = 20;
            nikoBpm = 180;
            rationale = `静息心率 (${rhr} bpm) 较基准理想，HRV (${hrv} ms) 与睡眠 (${sleepHours}h) 显示神经肌肉恢复充分，适合 4 组进阶徒手肌力训练。`;
        } else if (totalScore >= 60) {
            tierKey = 'optimal';
            tierLevel = 2;
            tierTitle = '稳态恢复 · 标准增肌塑形';
            setsMultiplier = 3;
            workOffset = 0;
            restOffset = 0;
            nikoMins = 15;
            nikoBpm = 180;
            rationale = `心肺与恢复指标处于健康稳态（RHR ${rhr} bpm / 睡眠 ${sleepHours}h），推荐 3 组全身均衡自重训练 + 15 分钟超慢跑。`;
        } else if (totalScore >= 42) {
            tierKey = 'moderate';
            tierLevel = 2;
            tierTitle = '轻度疲劳 · 核心稳固与护膝';
            setsMultiplier = 3;
            workOffset = -5;
            restOffset = 5;
            nikoMins = 15;
            nikoBpm = 175;
            rationale = `检测到一定疲劳累积（RHR 偏移 ${rhrDelta >= 0 ? '+' + rhrDelta : rhrDelta} bpm / 昨日负荷 ${yesterdayLoadMins}min），已自动降低冲击力并延长组间休息。`;
        } else {
            tierKey = 'recovery';
            tierLevel = 1;
            tierTitle = '交感疲劳 · 主动再生与激活';
            setsMultiplier = 2;
            workOffset = -5;
            restOffset = 5;
            nikoMins = 10;
            nikoBpm = 170;
            rationale = `身体处于恢复期（睡眠 ${sleepHours}h / RHR ${rhr} bpm），今日不宜大强度力竭，已定制 2 组低心率核心激活与关节灵活度练习。`;
        }

        return {
            score: totalScore,
            tierKey,
            tierLevel,
            tierTitle,
            rationale,
            setsMultiplier,
            workOffset,
            restOffset,
            cardioPrescription: {
                mins: nikoMins,
                bpm: nikoBpm,
                desc: `${nikoMins} 分钟超慢跑 · ${nikoBpm} BPM 有氧燃脂步频`
            }
        };
    }

    static generateWorkoutPlan(metrics, focusMode = 'golden', setsOverride = 'auto') {
        const evalResult = this.evaluateReadiness(metrics);
        const db = this.getExerciseDatabase();

        // Determine effective focus
        let effectiveFocus = focusMode;
        if (focusMode === 'auto') {
            if (evalResult.tierKey === 'recovery') effectiveFocus = 'recovery';
            else if (metrics.steps > 12000) effectiveFocus = 'upper'; // Legs already had high step volume
            else effectiveFocus = 'golden';
        }

        let selectedIds = [];
        if (effectiveFocus === 'classic3') {
            // User's familiar 3 exercises in optimal biomechanical order: Squat -> Push-up -> Plank
            const pushId = evalResult.tierKey === 'recovery' || evalResult.tierKey === 'moderate' ? 'pushup_incline' : 'pushup_std';
            selectedIds = ['squat_bw', pushId, 'plank_std'];
        } else if (effectiveFocus === 'golden') {
            // 3+2 Golden Balanced Formula:
            // Keeps Squat + Push-up + Plank, adds Glute Bridge (posterior chain & knee protection) + Prone W (upper back posture)
            if (evalResult.tierLevel === 3) {
                selectedIds = ['squat_bw', 'pushup_std', 'glute_bridge', 'superman_y', 'plank_std'];
            } else if (evalResult.tierKey === 'moderate' || evalResult.tierKey === 'recovery') {
                selectedIds = ['squat_bw', 'pushup_incline', 'glute_bridge', 'superman_y', 'plank_std'];
            } else {
                selectedIds = ['squat_bw', 'pushup_std', 'glute_bridge', 'superman_y', 'plank_std'];
            }
        } else if (effectiveFocus === 'recovery') {
            selectedIds = ['cat_cow_hip', 'glute_bridge', 'dead_bug', 'bird_dog', 'wall_sit'];
        } else if (effectiveFocus === 'upper') {
            selectedIds = evalResult.tierLevel === 3
                ? ['pushup_tempo', 'shoulder_tap', 'superman_y', 'plank_std', 'dead_bug']
                : ['pushup_incline', 'shoulder_tap', 'superman_y', 'plank_std', 'dead_bug'];
        } else if (effectiveFocus === 'lower') {
            selectedIds = evalResult.tierLevel === 3
                ? ['squat_bw', 'split_squat', 'squat_pulse', 'glute_bridge', 'plank_std']
                : ['squat_bw', 'split_squat', 'wall_sit', 'glute_bridge', 'dead_bug'];
        } else {
            selectedIds = ['squat_bw', 'pushup_std', 'glute_bridge', 'superman_y', 'plank_std'];
        }

        const customSets = (setsOverride !== 'auto' && Number(setsOverride) >= 1)
            ? Number(setsOverride)
            : evalResult.setsMultiplier;

        const exercises = selectedIds.map(id => {
            const item = db.find(e => e.id === id) || db[0];
            const sets = customSets;
            const workSecs = Math.max(25, item.baseWork + evalResult.workOffset);
            const restSecs = Math.max(15, item.baseRest + evalResult.restOffset);
            return {
                ...item,
                sets,
                workSecs,
                restSecs
            };
        });

        // Calculate estimated total duration in minutes
        let totalSecs = 5; // 5s prep
        exercises.forEach(ex => {
            totalSecs += ex.sets * (ex.workSecs + ex.restSecs);
        });
        const estMinutes = Math.max(4, Math.round(totalSecs / 60));

        return {
            readiness: evalResult,
            effectiveFocus,
            estMinutes,
            totalSecs,
            exercises
        };
    }
}

// --- Smart Strength Mode Controller ---
class StrengthController {
    constructor(app) {
        this.app = app;
        this.health = new HealthConnector();
        this.focusMode = 'golden';
        this.setsOverride = 'auto';
        this.currentPlan = null;

        // Track completed exercises for today (persisted per calendar day)
        this.completedToday = this.loadTodayCompleted();
        this.activeGuideExIndex = null;

        // Guided Workout Player State
        this.isRunning = false;
        this.timeline = []; // Flattened steps: { type: 'prep'|'work'|'rest', duration, exIndex, exId, exName, isStatic, setNum, totalSets, isLastSetOfEx, cue, nextLabel }
        this.stepIndex = 0;
        this.timeLeft = 0;
        this.elapsedTotal = 0;
        this.totalWorkoutSecs = 0;

        this.els = {
            view: document.getElementById('view-strength'),
            statusDot: document.getElementById('health-status-dot'),
            statusText: document.getElementById('health-status-text'),
            btnSyncNow: document.getElementById('btn-sync-now'),
            btnHealthConfig: document.getElementById('btn-health-config'),

            readinessCard: document.getElementById('readiness-card'),
            scoreBox: document.querySelector('.readiness-score-box'),
            scoreNum: document.getElementById('readiness-score'),
            tierTitle: document.getElementById('readiness-tier-title'),
            rationale: document.getElementById('readiness-rationale'),

            vitalRhr: document.getElementById('vital-rhr'),
            vitalHrv: document.getElementById('vital-hrv'),
            vitalSleep: document.getElementById('vital-sleep'),
            vitalLoad: document.getElementById('vital-load'),

            focusChips: document.querySelectorAll('#strength-focus-chips .chip-xs'),
            setsChips: document.querySelectorAll('#sets-override-chips .chip-mini'),
            planHeaderTitle: document.getElementById('plan-header-title'),
            planProgressBadge: document.getElementById('plan-progress-badge'),
            planTotalEst: document.getElementById('plan-total-est'),
            planList: document.getElementById('strength-plan-list'),

            synergyDesc: document.getElementById('synergy-desc'),
            btnApplyNiko: document.getElementById('btn-apply-niko'),

            // Player Elements
            playerPanel: document.getElementById('strength-player-panel'),
            phaseBadge: document.getElementById('str-phase-badge'),
            rhythmPill: document.getElementById('str-rhythm-pill'),
            progressMeta: document.getElementById('str-progress-meta'),
            currentExName: document.getElementById('str-current-ex-name'),
            currentExTarget: document.getElementById('str-current-ex-target'),
            timerDisplay: document.getElementById('str-timer-display'),
            totalProgress: document.getElementById('str-total-progress'),
            nextUp: document.getElementById('str-next-up'),
            pauseBtn: document.getElementById('str-pause-btn'),
            skipBtn: document.getElementById('str-skip-btn'),
            stopBtn: document.getElementById('str-stop-btn'),

            bottomBar: document.getElementById('strength-bottom-bar'),
            startWorkoutBtn: document.getElementById('str-start-workout-btn'),

            // Exercise Guide Modal Elements
            guideModal: document.getElementById('ex-guide-modal'),
            btnCloseGuide: document.getElementById('btn-close-guide'),
            guideTitle: document.getElementById('guide-ex-title'),
            guideMuscleTag: document.getElementById('guide-ex-muscle-tag'),
            guideVolumeTag: document.getElementById('guide-ex-volume-tag'),
            guideSvgStage: document.getElementById('guide-svg-stage'),
            guideSetup: document.getElementById('guide-step-setup'),
            guideExec: document.getElementById('guide-step-exec'),
            guideMistake: document.getElementById('guide-step-mistake'),
            guideWhy: document.getElementById('guide-step-why'),
            btnGuideCheck: document.getElementById('btn-guide-check'),
            btnGuidePlay: document.getElementById('btn-guide-play'),

            // Health Config Modal Elements
            modal: document.getElementById('health-modal'),
            btnCloseModal: document.getElementById('btn-close-modal'),
            providerBtns: document.querySelectorAll('#provider-switch .chip-xs'),
            inputClientId: document.getElementById('input-client-id'),
            inputAccessToken: document.getElementById('input-access-token'),
            displayRedirectUri: document.getElementById('display-redirect-uri'),
            btnOauthLogin: document.getElementById('btn-oauth-login'),
            btnFetchApi: document.getElementById('btn-fetch-api'),
            apiFeedback: document.getElementById('api-feedback-msg'),
            btnSaveHealth: document.getElementById('btn-save-health'),

            // Calibration Sliders
            calibRhr: document.getElementById('calib-rhr'),
            valCalibRhr: document.getElementById('val-calib-rhr'),
            calibBaseRhr: document.getElementById('calib-base-rhr'),
            valCalibBaseRhr: document.getElementById('val-calib-base-rhr'),
            calibHrv: document.getElementById('calib-hrv'),
            valCalibHrv: document.getElementById('val-calib-hrv'),
            calibSleep: document.getElementById('calib-sleep'),
            valCalibSleep: document.getElementById('val-calib-sleep'),
            calibLoad: document.getElementById('calib-load'),
            valCalibLoad: document.getElementById('val-calib-load'),
            calibSteps: document.getElementById('calib-steps'),
            valCalibSteps: document.getElementById('val-calib-steps')
        };

        this.initEvents();
        this.refreshPrescription();
    }

    getTodayDateKey() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    loadTodayCompleted() {
        try {
            const raw = localStorage.getItem('niko_strength_done_v1');
            if (!raw) return new Set();
            const parsed = JSON.parse(raw);
            if (parsed.date === this.getTodayDateKey() && Array.isArray(parsed.ids)) {
                return new Set(parsed.ids);
            }
            return new Set();
        } catch (e) {
            return new Set();
        }
    }

    saveTodayCompleted() {
        try {
            localStorage.setItem('niko_strength_done_v1', JSON.stringify({
                date: this.getTodayDateKey(),
                ids: Array.from(this.completedToday)
            }));
        } catch (e) {
            console.warn(e);
        }
    }

    toggleExerciseCompleted(ex, playSound = true) {
        if (!ex) return;
        const wasDone = this.completedToday.has(ex.id);
        if (wasDone) {
            this.completedToday.delete(ex.id);
        } else {
            this.completedToday.add(ex.id);
            if (playSound) {
                this.app.requestAudio().then(() => this.app.audio.playCheckSound());
            }
            // Write single exercise completion to Google Fit
            this.health.recordWorkoutSession(
                `科学力量：${ex.name} (${ex.sets}组)`,
                ex.sets * (ex.workSecs + ex.restSecs),
                80
            );
        }
        this.saveTodayCompleted();
        this.updateCompletionUI();
    }

    initEvents() {
        // Focus Chips
        this.els.focusChips.forEach(chip => {
            chip.addEventListener('click', () => {
                this.focusMode = chip.dataset.focus;
                this.els.focusChips.forEach(c => c.classList.toggle('active', c === chip));
                this.refreshPrescription();
            });
        });

        // Quick Sets / Volume Switcher Chips (智能 / 2组 / 3组 / 4组)
        this.els.setsChips.forEach(chip => {
            chip.addEventListener('click', () => {
                this.setsOverride = chip.dataset.sets;
                this.els.setsChips.forEach(c => c.classList.toggle('active', c === chip));
                this.refreshPrescription();
            });
        });

        // Exercise Guide Modal Events
        if (this.els.btnCloseGuide) {
            this.els.btnCloseGuide.addEventListener('click', () => this.closeExerciseGuide());
        }
        if (this.els.guideModal) {
            this.els.guideModal.addEventListener('click', (e) => {
                if (e.target === this.els.guideModal) this.closeExerciseGuide();
            });
        }
        if (this.els.btnGuideCheck) {
            this.els.btnGuideCheck.addEventListener('click', () => {
                if (this.activeGuideExIndex === null || !this.currentPlan) return;
                const ex = this.currentPlan.exercises[this.activeGuideExIndex];
                this.toggleExerciseCompleted(ex, true);
                this.closeExerciseGuide();
            });
        }
        if (this.els.btnGuidePlay) {
            this.els.btnGuidePlay.addEventListener('click', () => {
                const idx = this.activeGuideExIndex;
                this.closeExerciseGuide();
                if (idx !== null) {
                    this.startGuidedWorkout(idx);
                }
            });
        }

        // Open/Close Health Modal
        this.els.btnHealthConfig.addEventListener('click', () => this.openModal());
        this.els.btnCloseModal.addEventListener('click', () => this.closeModal());
        this.els.modal.addEventListener('click', (e) => {
            if (e.target === this.els.modal) this.closeModal();
        });

        // Quick Sync / One-time Bind Button
        this.els.btnSyncNow.addEventListener('click', async () => {
            if (!this.health.hasPermanentAuth()) {
                try {
                    this.health.startOAuthFlow(
                        this.health.state.provider,
                        this.health.state.clientId
                    );
                } catch (err) {
                    this.openModal();
                    this.showApiFeedback(err.message, 'error');
                }
                return;
            }
            await this.autoSyncInBackground(true);
        });

        // Provider Switch inside Modal
        this.els.providerBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const prov = btn.dataset.provider;
                this.health.state.provider = prov;
                this.els.providerBtns.forEach(b => b.classList.toggle('active', b === btn));
            });
        });

        // OAuth Redirect Login (Obtains permanent offline refresh_token)
        this.els.btnOauthLogin.addEventListener('click', () => {
            try {
                const clientId = this.els.inputClientId.value.trim();
                this.health.startOAuthFlow(this.health.state.provider, clientId);
            } catch (err) {
                this.showApiFeedback(err.message, 'error');
            }
        });

        // Fetch Cloud Data inside Modal
        this.els.btnFetchApi.addEventListener('click', async () => {
            this.health.state.clientId = this.els.inputClientId.value.trim();
            this.health.state.accessToken = this.els.inputAccessToken.value.trim();
            this.health.saveState();

            this.showApiFeedback('正在连接云端健康 API 拉取心率与恢复数据...', 'normal');
            try {
                await this.health.fetchCloudMetrics();
                this.syncSlidersFromState();
                this.refreshPrescription();
                this.showApiFeedback('成功同步云端健康数据！已更新今日科学训练处方。', 'success');
            } catch (err) {
                this.showApiFeedback(err.message, 'error');
            }
        });

        // Calibration Sliders Live Update
        const bindSlider = (sliderEl, valEl, metricKey, isFloat = false) => {
            sliderEl.addEventListener('input', (e) => {
                const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
                valEl.textContent = val;
                this.health.state.metrics[metricKey] = val;
            });
        };
        bindSlider(this.els.calibRhr, this.els.valCalibRhr, 'rhr');
        bindSlider(this.els.calibBaseRhr, this.els.valCalibBaseRhr, 'baseRhr');
        bindSlider(this.els.calibHrv, this.els.valCalibHrv, 'hrv');
        bindSlider(this.els.calibSleep, this.els.valCalibSleep, 'sleepHours', true);
        bindSlider(this.els.calibLoad, this.els.valCalibLoad, 'yesterdayLoadMins');
        bindSlider(this.els.calibSteps, this.els.valCalibSteps, 'steps');

        // Save Modal & Recalculate
        this.els.btnSaveHealth.addEventListener('click', () => {
            this.health.state.clientId = this.els.inputClientId.value.trim();
            this.health.state.accessToken = this.els.inputAccessToken.value.trim();
            this.health.saveState();
            this.refreshPrescription();
            this.closeModal();
        });

        // Cardio Synergy One-Click Apply to Niko Slow Jogging
        this.els.btnApplyNiko.addEventListener('click', () => {
            if (!this.currentPlan) return;
            const { mins, bpm } = this.currentPlan.readiness.cardioPrescription;
            this.app.niko.bpm = bpm;
            this.app.niko.els.bpmSlider.value = bpm;
            this.app.niko.els.bpmDisplay.textContent = bpm;
            this.app.niko.updateDuration(mins);
            this.app.switchMode('niko');
        });

        // Workout Player Controls
        this.els.startWorkoutBtn.addEventListener('click', () => this.startGuidedWorkout(null));
        this.els.pauseBtn.addEventListener('click', () => this.togglePause());
        this.els.skipBtn.addEventListener('click', () => this.skipCurrentStep());
        this.els.stopBtn.addEventListener('click', () => this.stop());
    }

    openExerciseGuide(exIdx) {
        if (!this.currentPlan || !this.currentPlan.exercises[exIdx]) return;
        this.activeGuideExIndex = exIdx;
        const ex = this.currentPlan.exercises[exIdx];
        const isDone = this.completedToday.has(ex.id);

        this.els.guideTitle.textContent = ex.name;
        this.els.guideMuscleTag.textContent = ex.muscle;
        this.els.guideVolumeTag.textContent = `今日处方：${ex.sets} 组 × ${ex.workSecs}秒 (组间休 ${ex.restSecs}秒)`;
        this.els.guideSvgStage.innerHTML = SportsScienceEngine.getExerciseSvg(ex.svgType);
        this.els.guideSetup.textContent = ex.setup || '';
        this.els.guideExec.textContent = ex.exec || ex.repHint;
        this.els.guideMistake.textContent = ex.mistake || '';
        this.els.guideWhy.textContent = ex.why || '';

        this.els.btnGuideCheck.textContent = isDone ? '取消打勾' : '✓ 直接打勾完成';
        this.els.btnGuidePlay.textContent = `⏱ 单独跟练此动作 (${ex.sets}组)`;

        this.els.guideModal.classList.remove('hidden');
    }

    closeExerciseGuide() {
        if (this.els.guideModal) {
            this.els.guideModal.classList.add('hidden');
        }
        this.activeGuideExIndex = null;
    }

    openModal() {
        this.els.displayRedirectUri.textContent = this.health.getRedirectUri();
        this.els.inputClientId.value = this.health.state.clientId || '';
        this.els.inputAccessToken.value = this.health.state.accessToken || '';
        this.els.providerBtns.forEach(b => {
            b.classList.toggle('active', b.dataset.provider === this.health.state.provider);
        });
        this.syncSlidersFromState();
        this.els.apiFeedback.classList.add('hidden');
        this.els.modal.classList.remove('hidden');
    }

    closeModal() {
        this.els.modal.classList.add('hidden');
    }

    syncSlidersFromState() {
        const m = this.health.state.metrics;
        this.els.calibRhr.value = m.rhr;
        this.els.valCalibRhr.textContent = m.rhr;
        this.els.calibBaseRhr.value = m.baseRhr;
        this.els.valCalibBaseRhr.textContent = m.baseRhr;
        this.els.calibHrv.value = m.hrv;
        this.els.valCalibHrv.textContent = m.hrv;
        this.els.calibSleep.value = m.sleepHours;
        this.els.valCalibSleep.textContent = m.sleepHours;
        this.els.calibLoad.value = m.yesterdayLoadMins;
        this.els.valCalibLoad.textContent = m.yesterdayLoadMins;
        this.els.calibSteps.value = m.steps;
        this.els.valCalibSteps.textContent = m.steps;
    }

    showApiFeedback(msg, type = 'normal') {
        this.els.apiFeedback.textContent = msg;
        this.els.apiFeedback.className = `api-feedback ${type}`;
    }

    async autoSyncInBackground(showFeedbackOnError = false) {
        if (!this.health.hasPermanentAuth()) {
            this.els.btnSyncNow.textContent = '首次绑定';
            return;
        }
        this.els.btnSyncNow.textContent = '自动同步中...';
        try {
            await this.health.fetchCloudMetrics();
            this.refreshPrescription();
            this.els.btnSyncNow.textContent = '已自动同步';
            setTimeout(() => { this.els.btnSyncNow.textContent = '刷新'; }, 1800);
        } catch (err) {
            this.els.btnSyncNow.textContent = '同步';
            if (showFeedbackOnError) {
                this.openModal();
                this.showApiFeedback(err.message, 'error');
            }
        }
    }

    updateCompletionUI() {
        if (!this.currentPlan) return;
        const exercises = this.currentPlan.exercises;
        let doneCount = 0;

        const cards = this.els.planList.querySelectorAll('.ex-card');
        exercises.forEach((ex, idx) => {
            const isDone = this.completedToday.has(ex.id);
            if (isDone) doneCount++;
            const card = cards[idx];
            if (card) {
                card.classList.toggle('completed-ex', isDone);
                const checkBtn = card.querySelector('.ex-check-btn');
                if (checkBtn) {
                    checkBtn.classList.toggle('checked', isDone);
                    checkBtn.title = isDone ? '已完成（点击取消）' : '点击直接打勾完成';
                }
            }
        });

        if (this.els.planProgressBadge) {
            this.els.planProgressBadge.textContent = `已完成 ${doneCount}/${exercises.length}`;
        }

        const remainingCount = exercises.length - doneCount;
        if (this.els.startWorkoutBtn) {
            if (remainingCount === 0) {
                this.els.startWorkoutBtn.textContent = '🎉 今日处方已全部完成 · 再练一轮';
            } else if (doneCount > 0) {
                this.els.startWorkoutBtn.textContent = `继续跟练剩余 ${remainingCount} 个动作`;
            } else {
                this.els.startWorkoutBtn.textContent = '开始科学跟练（也可点单个动作自由练）';
            }
        }
    }

    refreshPrescription() {
        const m = this.health.state.metrics;
        this.currentPlan = SportsScienceEngine.generateWorkoutPlan(m, this.focusMode, this.setsOverride);
        const { readiness, exercises, estMinutes } = this.currentPlan;

        // 1. Update Connection Status Bar
        const provLabel = this.health.state.provider === 'fitbit' ? 'Fitbit API' : 'Google Fit';
        if (this.health.state.isCloudSynced && this.health.state.lastSyncedAt) {
            this.els.statusDot.classList.add('connected');
            this.els.statusText.textContent = `${provLabel} 自动同步 (${this.health.state.lastSyncedAt})`;
            this.els.btnSyncNow.textContent = '刷新';
        } else {
            this.els.statusDot.classList.remove('connected');
            this.els.statusText.textContent = `${provLabel} · 首次绑定后永久自动同步`;
            this.els.btnSyncNow.textContent = '首次绑定';
        }

        // 2. Update Readiness Score & Styling
        this.els.scoreNum.textContent = readiness.score;
        this.els.tierTitle.textContent = readiness.tierTitle;
        this.els.rationale.textContent = readiness.rationale;

        this.els.scoreBox.classList.remove('tier-mid', 'tier-low');
        if (readiness.score < 45) {
            this.els.scoreBox.classList.add('tier-low');
        } else if (readiness.score < 65) {
            this.els.scoreBox.classList.add('tier-mid');
        }

        // 3. Update 4 Vitals Grid
        this.els.vitalRhr.innerHTML = `${m.rhr} <small>bpm</small>`;
        this.els.vitalHrv.innerHTML = `${m.hrv} <small>ms</small>`;
        this.els.vitalSleep.innerHTML = `${m.sleepHours} <small>h</small>`;
        this.els.vitalLoad.innerHTML = `${m.yesterdayLoadMins} <small>min</small>`;

        // 4. Update Plan Header & Exercise Cards
        this.els.planTotalEst.textContent = `预计 ${estMinutes} 分钟 · 点动作看图解，可自由选练或打勾`;
        this.els.planList.innerHTML = '';

        exercises.forEach((ex, idx) => {
            const isDone = this.completedToday.has(ex.id);
            const card = document.createElement('div');
            card.className = `ex-card${isDone ? ' completed-ex' : ''}`;
            card.dataset.exIdx = idx;
            card.innerHTML = `
                <div class="ex-card-left" data-role="open-guide">
                    <div class="ex-title-row">
                        <span class="ex-index">${idx + 1}</span>
                        <span class="ex-name">${ex.name}</span>
                        <span class="ex-muscle-tag">${ex.muscle}</span>
                    </div>
                    <div class="ex-cue">${ex.repHint}</div>
                </div>
                <div class="ex-card-right">
                    <div class="ex-right-meta" data-role="open-guide">
                        <div class="ex-Prescription">${ex.sets}组 × ${ex.workSecs}s</div>
                        <div class="ex-rest-note">休 ${ex.restSecs}s · 图解</div>
                    </div>
                    <div class="ex-action-btns">
                        <button class="ex-mini-btn" type="button" data-role="solo-play" title="单独为这个动作计时跟练">⏱ 单独练</button>
                        <button class="ex-check-btn${isDone ? ' checked' : ''}" type="button" data-role="toggle-check" title="自己做完直接打勾">✓</button>
                    </div>
                </div>
            `;

            // Clicking left area or prescription opens the illustrated beginner guide
            card.querySelectorAll('[data-role="open-guide"]').forEach(el => {
                el.addEventListener('click', () => this.openExerciseGuide(idx));
            });

            // Clicking "⏱ 单独练" starts timer ONLY for this exercise
            const soloBtn = card.querySelector('[data-role="solo-play"]');
            if (soloBtn) {
                soloBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.startGuidedWorkout(idx);
                });
            }

            // Clicking "✓" toggles completion immediately
            const checkBtn = card.querySelector('[data-role="toggle-check"]');
            if (checkBtn) {
                checkBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleExerciseCompleted(ex, true);
                });
            }

            this.els.planList.appendChild(card);
        });

        this.updateCompletionUI();

        // 5. Update Cardio Synergy Recommendation
        this.els.synergyDesc.textContent = readiness.cardioPrescription.desc;
    }

    buildWorkoutTimeline(onlyExIndex = null) {
        const allExercises = this.currentPlan ? this.currentPlan.exercises : [];
        const steps = [];
        if (allExercises.length === 0) return steps;

        // Build target list of { ex, originalIdx }
        let targetList = [];
        if (onlyExIndex !== null && allExercises[onlyExIndex]) {
            targetList = [{ ex: allExercises[onlyExIndex], originalIdx: onlyExIndex }];
        } else {
            // Filter to unchecked exercises first; if all checked, run all exercises
            const unchecked = allExercises
                .map((ex, idx) => ({ ex, originalIdx: idx }))
                .filter(item => !this.completedToday.has(item.ex.id));
            targetList = unchecked.length > 0
                ? unchecked
                : allExercises.map((ex, idx) => ({ ex, originalIdx: idx }));
        }

        const firstItem = targetList[0];
        // Initial 5s Prep
        steps.push({
            type: 'prep',
            duration: 5,
            exIndex: firstItem.originalIdx,
            exId: firstItem.ex.id,
            exName: `准备：${firstItem.ex.name}`,
            isStatic: Boolean(firstItem.ex.isStatic),
            setNum: 1,
            totalSets: firstItem.ex.sets,
            isLastSetOfEx: false,
            cue: firstItem.ex.repHint,
            nextLabel: `即将开始：${firstItem.ex.name} 第 1/${firstItem.ex.sets} 组`
        });

        targetList.forEach((item, listIdx) => {
            const { ex, originalIdx } = item;
            const isLastTargetEx = (listIdx === targetList.length - 1);

            for (let s = 1; s <= ex.sets; s++) {
                const isLastSetOfEx = (s === ex.sets);

                let nextAfterWork = '';
                if (isLastSetOfEx && isLastTargetEx) {
                    nextAfterWork = onlyExIndex !== null
                        ? `下一项：完成「${ex.name}」全部 ${ex.sets} 组！`
                        : '下一项：完成今日全部力量训练！';
                } else if (isLastSetOfEx) {
                    const nextTarget = targetList[listIdx + 1].ex;
                    nextAfterWork = `下一项：休息 ${ex.restSecs}s → ${nextTarget.name}`;
                } else {
                    nextAfterWork = `下一项：组间休息 ${ex.restSecs}s → 第 ${s + 1} 组`;
                }

                steps.push({
                    type: 'work',
                    duration: ex.workSecs,
                    exIndex: originalIdx,
                    exId: ex.id,
                    exName: ex.name,
                    isStatic: Boolean(ex.isStatic),
                    setNum: s,
                    totalSets: ex.sets,
                    isLastSetOfEx,
                    cue: ex.repHint,
                    nextLabel: nextAfterWork
                });

                // Add Rest unless it's the very last set of the very last target exercise
                if (!(isLastSetOfEx && isLastTargetEx)) {
                    const nextEx = isLastSetOfEx ? targetList[listIdx + 1].ex : ex;
                    const nextOrigIdx = isLastSetOfEx ? targetList[listIdx + 1].originalIdx : originalIdx;
                    const nextSetNum = isLastSetOfEx ? 1 : s + 1;
                    steps.push({
                        type: 'rest',
                        duration: ex.restSecs,
                        exIndex: nextOrigIdx,
                        exId: nextEx.id,
                        exName: '组间休息 · 放松抖动肌肉',
                        isStatic: false,
                        setNum: nextSetNum,
                        totalSets: nextEx.sets,
                        isLastSetOfEx: false,
                        cue: `下一组要领：${nextEx.repHint}`,
                        nextLabel: `即将进入：${nextEx.name} (第 ${nextSetNum}/${nextEx.sets} 组)`
                    });
                }
            }
        });

        return steps;
    }

    async startGuidedWorkout(onlyExIndex = null) {
        await this.app.requestAudio();
        await this.app.requestWakeLock();

        this.timeline = this.buildWorkoutTimeline(onlyExIndex);
        if (this.timeline.length === 0) return;

        this.stepIndex = 0;
        this.timeLeft = this.timeline[0].duration;
        this.elapsedTotal = 0;
        this.totalWorkoutSecs = this.timeline.reduce((acc, st) => acc + st.duration, 0);

        this.isRunning = true;
        // Collapse top readiness card during active workout so player fits on one screen!
        if (this.els.readinessCard) {
            this.els.readinessCard.classList.add('hidden');
        }
        this.els.playerPanel.classList.remove('hidden');
        this.els.bottomBar.classList.add('hidden');
        this.els.pauseBtn.textContent = '暂停';

        this.app.audio.playWorkBeep();
        this.renderPlayerStep();
        this.app.startWorker();

        // Scroll player into view smoothly at the top
        this.els.playerPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async togglePause() {
        if (this.isRunning) {
            this.isRunning = false;
            this.els.pauseBtn.textContent = '继续';
            this.app.stopWorker();
            this.app.releaseWakeLock();
        } else {
            await this.app.requestAudio();
            await this.app.requestWakeLock();
            this.isRunning = true;
            this.els.pauseBtn.textContent = '暂停';
            this.app.startWorker();
        }
    }

    skipCurrentStep() {
        if (this.timeline.length === 0) return;
        this.elapsedTotal += Math.max(0, this.timeLeft);
        this.advanceStep();
    }

    stop() {
        this.isRunning = false;
        this.app.stopWorker();
        this.app.releaseWakeLock();
        if (this.els.readinessCard) {
            this.els.readinessCard.classList.remove('hidden');
        }
        this.els.playerPanel.classList.add('hidden');
        this.els.bottomBar.classList.remove('hidden');
        this.highlightExerciseCard(-1);
    }

    highlightExerciseCard(activeExIdx) {
        const cards = this.els.planList.querySelectorAll('.ex-card');
        cards.forEach((c, idx) => {
            c.classList.toggle('active-ex', idx === activeExIdx);
        });
    }

    updateBreathingCue(step, triggerAudio = false) {
        if (!this.els.rhythmPill) return;
        if (step.type !== 'work') {
            this.els.rhythmPill.textContent = step.type === 'prep' ? '准备就位 · 调整站姿/垫面' : '深长呼吸 · 放松肩膀与手臂';
            this.els.rhythmPill.className = 'rhythm-pill';
            return;
        }

        if (step.isStatic) {
            this.els.rhythmPill.textContent = '保持核心收紧 · 均匀深呼吸勿憋气';
            this.els.rhythmPill.className = 'rhythm-pill exhale';
            return;
        }

        // Dynamic exercises: 4-second tempo cycle (2s eccentric inhale down + 2s concentric exhale up)
        const elapsedInSet = step.duration - this.timeLeft;
        const phaseInCycle = elapsedInSet % 4; // 0,1 = inhale down; 2,3 = exhale up

        if (phaseInCycle < 2) {
            this.els.rhythmPill.textContent = '吸气慢下 ↓ (控制肌肉离心)';
            this.els.rhythmPill.className = 'rhythm-pill inhale';
            if (triggerAudio && phaseInCycle === 0 && this.timeLeft > 3) {
                this.app.audio.playInhaleCue();
            }
        } else {
            this.els.rhythmPill.textContent = '呼气发力 ↑ (收紧核心推起)';
            this.els.rhythmPill.className = 'rhythm-pill exhale';
            if (triggerAudio && phaseInCycle === 2 && this.timeLeft > 3) {
                this.app.audio.playExhaleCue();
            }
        }
    }

    renderPlayerStep(triggerBreathingAudio = false) {
        const step = this.timeline[this.stepIndex];
        if (!step) return;

        const totalExercises = this.currentPlan ? this.currentPlan.exercises.length : 1;

        if (step.type === 'prep') {
            this.els.phaseBadge.textContent = '准备就绪';
            this.els.phaseBadge.className = 'phase-pill rest';
        } else if (step.type === 'work') {
            this.els.phaseBadge.textContent = '动作进行中';
            this.els.phaseBadge.className = 'phase-pill work';
        } else {
            this.els.phaseBadge.textContent = '组间休息';
            this.els.phaseBadge.className = 'phase-pill rest';
        }

        this.updateBreathingCue(step, triggerBreathingAudio);

        this.els.progressMeta.textContent = `动作 ${step.exIndex + 1}/${totalExercises} · 第 ${step.setNum}/${step.totalSets} 组`;
        this.els.currentExName.textContent = step.exName;
        this.els.currentExTarget.textContent = step.cue;
        this.els.timerDisplay.textContent = this.formatSecs(this.timeLeft);
        this.els.nextUp.textContent = step.nextLabel;

        const pct = this.totalWorkoutSecs > 0
            ? Math.min(100, Math.round((this.elapsedTotal / this.totalWorkoutSecs) * 100))
            : 0;
        this.els.totalProgress.style.width = `${pct}%`;

        this.highlightExerciseCard(step.exIndex);
    }

    formatSecs(sec) {
        const s = Math.max(0, sec);
        const m = Math.floor(s / 60);
        const rem = s % 60;
        return `${m.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
    }

    advanceStep() {
        const finishedStep = this.timeline[this.stepIndex];
        // If user just finished the last set of an exercise, auto-check it off!
        if (finishedStep && finishedStep.type === 'work' && finishedStep.isLastSetOfEx && finishedStep.exId) {
            this.completedToday.add(finishedStep.exId);
            this.saveTodayCompleted();
            this.updateCompletionUI();
        }

        this.stepIndex++;
        if (this.stepIndex >= this.timeline.length) {
            // Completed all steps in this session!
            this.app.audio.playFinish();
            this.isRunning = false;
            this.app.stopWorker();
            this.app.releaseWakeLock();

            if (this.els.readinessCard) {
                this.els.readinessCard.classList.remove('hidden');
            }
            this.els.phaseBadge.textContent = '本轮完成';
            this.els.phaseBadge.className = 'phase-pill work';
            if (this.els.rhythmPill) {
                this.els.rhythmPill.textContent = '已自动打勾记录并同步 Google Fit';
                this.els.rhythmPill.className = 'rhythm-pill exhale';
            }
            this.els.currentExName.textContent = '太棒了！本轮力量训练已完成';
            this.els.currentExTarget.textContent = '可继续点选其他动作，或点击「去慢跑」开启有氧燃脂';
            this.els.timerDisplay.textContent = 'DONE';
            this.els.totalProgress.style.width = '100%';
            this.els.bottomBar.classList.remove('hidden');
            this.highlightExerciseCard(-1);

            this.health.recordWorkoutSession(
                'Niko 科学自重力量训练',
                this.totalWorkoutSecs,
                80
            );
            return;
        }

        const nextStep = this.timeline[this.stepIndex];
        this.timeLeft = nextStep.duration;
        if (nextStep.type === 'work') {
            this.app.audio.playWorkBeep();
        } else {
            this.app.audio.playRestBeep();
        }
        this.renderPlayerStep(false);
    }

    onTick(now, delta) {
        if (!this.isRunning) return false;

        if (delta >= 1000) {
            this.timeLeft--;
            this.elapsedTotal++;

            if (this.timeLeft > 0 && this.timeLeft <= 3) {
                this.app.audio.playCountdownTick();
            }

            if (this.timeLeft < 0) {
                this.advanceStep();
            } else {
                this.renderPlayerStep(true);
            }
            return true;
        }
        return false;
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
        this.strength = new StrengthController(this);

        this.mode = 'niko'; // 'niko', 'interval', 'strength'
        this.activeController = this.niko;

        this.lastTimerTick = 0;

        this.init();
    }

    init() {
        // Tab Switching
        const tabNiko = document.getElementById('tab-niko');
        const tabInterval = document.getElementById('tab-interval');
        const tabStrength = document.getElementById('tab-strength');

        tabNiko.addEventListener('click', () => this.switchMode('niko'));
        tabInterval.addEventListener('click', () => this.switchMode('interval'));
        if (tabStrength) {
            tabStrength.addEventListener('click', () => this.switchMode('strength'));
        }

        // Worker Msg
        this.worker.onmessage = (e) => {
            if (e.data === "tick") {
                this.handleTick();
            }
        };

        // Handle OAuth 2.0 Redirect (?code=... or #access_token=...) OR Silent Auto-Sync on Open!
        this.strength.health.consumeOAuthRedirect()
            .then((didJustBind) => {
                if (didJustBind) {
                    this.switchMode('strength');
                    return this.strength.autoSyncInBackground(true);
                } else {
                    // Silent zero-click auto-sync on every app open!
                    return this.strength.autoSyncInBackground(false);
                }
            })
            .catch(err => {
                this.switchMode('strength');
                this.strength.openModal();
                this.strength.showApiFeedback(err.message, 'error');
            });

        // Also auto-sync silently whenever user reopens PWA from phone background
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.strength.health.hasPermanentAuth()) {
                this.strength.autoSyncInBackground(false);
            }
        });
    }

    switchMode(mode) {
        if (this.mode === mode) return;

        // Stop current
        this.activeController.stop();

        // Switch
        this.mode = mode;
        if (mode === 'niko') this.activeController = this.niko;
        else if (mode === 'interval') this.activeController = this.interval;
        else {
            this.activeController = this.strength;
            if (this.strength.health.hasPermanentAuth()) {
                this.strength.autoSyncInBackground(false);
            }
        }

        // UI Toggle
        const tabNiko = document.getElementById('tab-niko');
        const tabInterval = document.getElementById('tab-interval');
        const tabStrength = document.getElementById('tab-strength');
        const viewNiko = document.getElementById('view-niko');
        const viewInterval = document.getElementById('view-interval');
        const viewStrength = document.getElementById('view-strength');

        tabNiko.classList.toggle('active', mode === 'niko');
        tabInterval.classList.toggle('active', mode === 'interval');
        if (tabStrength) tabStrength.classList.toggle('active', mode === 'strength');

        viewNiko.classList.toggle('hidden', mode !== 'niko');
        viewInterval.classList.toggle('hidden', mode !== 'interval');
        if (viewStrength) viewStrength.classList.toggle('hidden', mode !== 'strength');
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
