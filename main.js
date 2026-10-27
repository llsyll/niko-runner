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
        const defaultClientId = '655421773700-rijiq092u67eun04r23pprf2i5c6d1ou.apps.googleusercontent.com';
        const defaults = {
            provider: 'google_fit', // 'google_fit' | 'fitbit'
            clientId: defaultClientId,
            accessToken: '',
            lastSyncedAt: null,
            isCloudSynced: false,
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
            return {
                ...defaults,
                ...parsed,
                clientId: parsed.clientId || defaultClientId,
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
        return window.location.origin + window.location.pathname;
    }

    // Check URL hash for OAuth 2.0 implicit grant callback (#access_token=...)
    consumeOAuthRedirectHash() {
        if (!window.location.hash || !window.location.hash.includes('access_token=')) {
            return false;
        }
        const params = new URLSearchParams(window.location.hash.substring(1));
        const token = params.get('access_token');
        const stateParam = params.get('state');
        if (token) {
            this.state.accessToken = token;
            if (stateParam === 'fitbit' || stateParam === 'google_fit') {
                this.state.provider = stateParam;
            }
            this.saveState();
            // Clean URL hash
            history.replaceState(null, document.title, window.location.pathname + window.location.search);
            return true;
        }
        return false;
    }

    startOAuthFlow(provider, clientId, onTokenReceived) {
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
            const authUrl = `https://www.fitbit.com/oauth2/authorize?response_type=token&client_id=${encodedClientId}&redirect_uri=${redirectUri}&scope=${scope}&expires_in=604800&state=fitbit`;
            window.location.href = authUrl;
        } else {
            // Google Fit REST API OAuth 2.0
            const scopes = [
                'https://www.googleapis.com/auth/fitness.heart_rate.read',
                'https://www.googleapis.com/auth/fitness.activity.read',
                'https://www.googleapis.com/auth/fitness.sleep.read',
                'https://www.googleapis.com/auth/fitness.activity.write'
            ].join(' ');

            // Prefer Google Identity Services (GIS) popup if loaded
            if (window.google && window.google.accounts && window.google.accounts.oauth2) {
                const tokenClient = window.google.accounts.oauth2.initTokenClient({
                    client_id: this.state.clientId,
                    scope: scopes,
                    callback: (resp) => {
                        if (resp && resp.access_token) {
                            this.state.accessToken = resp.access_token;
                            this.saveState();
                            if (typeof onTokenReceived === 'function') {
                                onTokenReceived(resp.access_token);
                            }
                        }
                    }
                });
                tokenClient.requestAccessToken({ prompt: 'consent' });
                return;
            }

            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=token&client_id=${encodedClientId}&redirect_uri=${redirectUri}&scope=${encodeURIComponent(scopes)}&include_granted_scopes=true&state=google_fit`;
            window.location.href = authUrl;
        }
    }

    async fetchCloudMetrics() {
        const token = (this.state.accessToken || '').trim();
        if (!token) {
            throw new Error('未检测到 Access Token，请先点击「OAuth 授权登录」或粘贴 Access Token');
        }
        if (this.state.provider === 'fitbit') {
            return await this.fetchFromFitbit(token);
        } else {
            return await this.fetchFromGoogleFit(token);
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

        // 1. Aggregate Heart Rate, Step Count, Active Minutes over yesterday + today
        const aggResp = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                aggregateBy: [
                    { dataTypeName: 'com.google.heart_rate.bpm' },
                    { dataTypeName: 'com.google.step_count.delta' },
                    { dataTypeName: 'com.google.active_minutes' }
                ],
                bucketByTime: { durationMillis: 86400000 },
                startTimeMillis: startOfYesterday,
                endTimeMillis: now
            })
        });

        if (!aggResp.ok) {
            const errText = await aggResp.text();
            throw new Error(`Google Fit API 请求失败 (${aggResp.status}): 请检查 Token 权限或是否过期`);
        }

        const aggData = await aggResp.json();
        const buckets = aggData.bucket || [];

        let latestMinHr = null;
        let latestAvgHr = null;
        let totalStepsToday = 0;
        let yesterdaySteps = 0;
        let yesterdayActiveMins = 0;
        let todayActiveMins = 0;

        buckets.forEach((b, idx) => {
            const isTodayBucket = (idx === buckets.length - 1);
            (b.dataset || []).forEach(ds => {
                const sourceId = ds.dataSourceId || '';
                (ds.point || []).forEach(pt => {
                    const vals = pt.value || [];
                    if (sourceId.includes('heart_rate')) {
                        // Aggregate heart rate has fpVal: [avg, max, min]
                        const avg = vals[0]?.fpVal;
                        const min = vals[2]?.fpVal || avg;
                        if (min && min > 35 && min < 110) {
                            latestMinHr = Math.round(min);
                        }
                        if (avg && avg > 40 && avg < 130) {
                            latestAvgHr = Math.round(avg);
                        }
                    } else if (sourceId.includes('step_count')) {
                        const steps = vals[0]?.intVal || 0;
                        if (isTodayBucket) totalStepsToday += steps;
                        else yesterdaySteps += steps;
                    } else if (sourceId.includes('active_minutes')) {
                        const mins = vals[0]?.intVal || 0;
                        if (isTodayBucket) todayActiveMins += mins;
                        else yesterdayActiveMins += mins;
                    }
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
        this.state.metrics.steps = totalStepsToday > 0 ? totalStepsToday : yesterdaySteps;
        this.state.metrics.yesterdayLoadMins = yesterdayActiveMins > 0 ? yesterdayActiveMins : todayActiveMins;

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
}

// --- Pure Sports Science Prescription Engine (Local, Zero-Latency) ---
class SportsScienceEngine {
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
                repHint: '10-15 次 · 吸气慢下3秒，呼气推起，手肘微收45°不耸肩'
            },
            {
                id: 'pushup_tempo',
                name: '离心控制俯卧撑 (3秒慢下)',
                category: 'upper',
                muscle: '进阶推力 · 胸部深层/肩袖稳定',
                tier: [3],
                baseWork: 45,
                baseRest: 35,
                repHint: '8-12 次 · 下放3秒，底部停顿1秒有力推起'
            },
            {
                id: 'pushup_incline',
                name: '跪姿/扶墙上斜俯卧撑',
                category: 'upper',
                muscle: '轻松推力 · 胸肌激活/护腕护肩',
                tier: [1, 2],
                baseWork: 35,
                baseRest: 25,
                repHint: '10-15 次 · 双膝着地或双手扶稳桌面，保持腰背平直'
            },
            {
                id: 'shoulder_tap',
                name: '高平板支撑交替摸肩',
                category: 'upper',
                muscle: '补齐短板 · 核心抗旋转/肩带稳定',
                tier: [2, 3],
                baseWork: 40,
                baseRest: 25,
                repHint: '16-20 次 · 双脚略宽，抬手摸对侧肩时骨盆不左右晃'
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
                repHint: '15-20 次 · 吸气臀部向后坐，膝盖对准脚尖不内扣'
            },
            {
                id: 'split_squat',
                name: '后撤箭步蹲 (左右交替)',
                category: 'lower',
                muscle: '补齐短板 · 单腿平衡/跑步护膝',
                tier: [2, 3],
                baseWork: 45,
                baseRest: 30,
                repHint: '每侧 8-10 次 · 向后退一步下蹲，前脚全脚掌踩实地面发力'
            },
            {
                id: 'squat_pulse',
                name: '深蹲底部脉冲 + 提踵',
                category: 'lower',
                muscle: '补齐短板 · 小腿跟腱/落地缓冲',
                tier: [3],
                baseWork: 45,
                baseRest: 35,
                repHint: '12-15 次 · 起身时顺势踮起脚尖，强化超慢跑足踝弹性'
            },
            {
                id: 'glute_bridge',
                name: '仰卧臀桥 (顶峰停顿2秒)',
                category: 'lower',
                muscle: '补齐短板 · 臀大肌/大腿后侧护膝',
                tier: [1, 2, 3],
                baseWork: 40,
                baseRest: 20,
                repHint: '12-16 次 · 仰卧屈膝，用臀部发力顶起髋部，顶部夹紧2秒'
            },
            {
                id: 'wall_sit',
                name: '靠墙静蹲 (等长护膝)',
                category: 'lower',
                muscle: '补齐短板 · 髌骨周围强化',
                tier: [1, 2],
                baseWork: 40,
                baseRest: 25,
                repHint: '保持静态 · 后背贴墙，小腿垂直地面，感受大腿前侧发热'
            },
            // Core & Back Postural Balance
            {
                id: 'plank_std',
                name: '标准平板支撑',
                category: 'core',
                muscle: '保留核心 · 腹横肌/静态核心',
                tier: [2, 3],
                baseWork: 45,
                baseRest: 25,
                repHint: '保持静态 · 手肘在肩正下方，收腹夹臀不塌腰，均匀呼吸'
            },
            {
                id: 'dead_bug',
                name: '死虫式 (Dead Bug)',
                category: 'core',
                muscle: '补齐短板 · 动态核心/预防腰痛',
                tier: [1, 2, 3],
                baseWork: 40,
                baseRest: 20,
                repHint: '交替 12-16 次 · 仰卧抬手脚，对侧手脚慢放，后腰死死贴紧地面'
            },
            {
                id: 'bird_dog',
                name: '鸟狗式对侧伸展 (Bird-Dog)',
                category: 'recovery',
                muscle: '补齐短板 · 腰背深层稳定/协调',
                tier: [1, 2],
                baseWork: 40,
                baseRest: 20,
                repHint: '交替 10-12 次 · 四足跪姿，伸出左手右脚呈水平线，停顿1秒换边'
            },
            {
                id: 'superman_y',
                name: '俯卧 W字展肩 (徒手练背)',
                category: 'upper',
                muscle: '补齐短板 · 上背部/防圆肩驼背',
                tier: [1, 2, 3],
                baseWork: 40,
                baseRest: 20,
                repHint: '12-15 次 · 趴在垫上，双臂屈肘呈W型向上抬起，夹紧后背肩胛骨'
            },
            {
                id: 'cat_cow_hip',
                name: '猫牛式脊柱流动 + 髋部伸展',
                category: 'recovery',
                muscle: '恢复再生 · 脊柱灵活/骨盆放松',
                tier: [1],
                baseWork: 40,
                baseRest: 15,
                repHint: '缓慢深呼吸 · 吸气抬头塌腰延展，呼气低头拱背放松腰椎'
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

    static generateWorkoutPlan(metrics, focusMode = 'golden') {
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
            // Keeps Squat + Push-up + Plank, adds Glute Bridge/Split Squat (posterior chain & knee protection) + Prone W (upper back posture)
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

        const exercises = selectedIds.map(id => {
            const item = db.find(e => e.id === id) || db[0];
            const sets = evalResult.setsMultiplier;
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
        const estMinutes = Math.max(5, Math.round(totalSecs / 60));

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
        this.currentPlan = null;

        // Guided Workout Player State
        this.isRunning = false;
        this.timeline = []; // Flattened steps: { type: 'prep'|'work'|'rest', duration, exIndex, exName, setNum, totalSets, cue, nextLabel }
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
            planHeaderTitle: document.getElementById('plan-header-title'),
            planTotalEst: document.getElementById('plan-total-est'),
            planList: document.getElementById('strength-plan-list'),

            synergyDesc: document.getElementById('synergy-desc'),
            btnApplyNiko: document.getElementById('btn-apply-niko'),

            // Player Elements
            playerPanel: document.getElementById('strength-player-panel'),
            phaseBadge: document.getElementById('str-phase-badge'),
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

            // Modal Elements
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

    initEvents() {
        // Focus Chips
        this.els.focusChips.forEach(chip => {
            chip.addEventListener('click', () => {
                this.focusMode = chip.dataset.focus;
                this.els.focusChips.forEach(c => c.classList.toggle('active', c === chip));
                this.refreshPrescription();
            });
        });

        // Open/Close Modal
        this.els.btnHealthConfig.addEventListener('click', () => this.openModal());
        this.els.btnCloseModal.addEventListener('click', () => this.closeModal());
        this.els.modal.addEventListener('click', (e) => {
            if (e.target === this.els.modal) this.closeModal();
        });

        // Quick Sync Button
        this.els.btnSyncNow.addEventListener('click', async () => {
            if (!this.health.state.accessToken) {
                try {
                    this.health.startOAuthFlow(
                        this.health.state.provider,
                        this.health.state.clientId,
                        async (token) => {
                            this.els.inputAccessToken.value = token;
                            this.els.btnSyncNow.textContent = '同步中...';
                            try {
                                await this.health.fetchCloudMetrics();
                                this.refreshPrescription();
                                this.els.btnSyncNow.textContent = '已同步';
                                setTimeout(() => { this.els.btnSyncNow.textContent = '同步'; }, 1500);
                            } catch (e) {
                                this.els.btnSyncNow.textContent = '同步';
                                this.openModal();
                                this.showApiFeedback(e.message, 'error');
                            }
                        }
                    );
                } catch (err) {
                    this.openModal();
                    this.showApiFeedback(err.message, 'error');
                }
                return;
            }
            this.els.btnSyncNow.textContent = '同步中...';
            try {
                await this.health.fetchCloudMetrics();
                this.refreshPrescription();
                this.els.btnSyncNow.textContent = '已同步';
                setTimeout(() => { this.els.btnSyncNow.textContent = '同步'; }, 1500);
            } catch (err) {
                this.els.btnSyncNow.textContent = '同步';
                this.openModal();
                this.showApiFeedback(err.message, 'error');
            }
        });

        // Provider Switch inside Modal
        this.els.providerBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const prov = btn.dataset.provider;
                this.health.state.provider = prov;
                this.els.providerBtns.forEach(b => b.classList.toggle('active', b === btn));
            });
        });

        // OAuth Redirect / Popup Login
        this.els.btnOauthLogin.addEventListener('click', () => {
            try {
                const clientId = this.els.inputClientId.value.trim();
                this.health.startOAuthFlow(this.health.state.provider, clientId, async (token) => {
                    this.els.inputAccessToken.value = token;
                    this.showApiFeedback('Google 授权成功！正在拉取健康数据...', 'normal');
                    try {
                        await this.health.fetchCloudMetrics();
                        this.syncSlidersFromState();
                        this.refreshPrescription();
                        this.showApiFeedback('成功同步 Google Fit 云端数据！已更新今日处方。', 'success');
                    } catch (e) {
                        this.showApiFeedback(e.message, 'error');
                    }
                });
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
        this.els.startWorkoutBtn.addEventListener('click', () => this.startGuidedWorkout());
        this.els.pauseBtn.addEventListener('click', () => this.togglePause());
        this.els.skipBtn.addEventListener('click', () => this.skipCurrentStep());
        this.els.stopBtn.addEventListener('click', () => this.stop());
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

    refreshPrescription() {
        const m = this.health.state.metrics;
        this.currentPlan = SportsScienceEngine.generateWorkoutPlan(m, this.focusMode);
        const { readiness, exercises, estMinutes } = this.currentPlan;

        // 1. Update Connection Status Bar
        const provLabel = this.health.state.provider === 'fitbit' ? 'Fitbit API' : 'Google Fit';
        if (this.health.state.isCloudSynced && this.health.state.lastSyncedAt) {
            this.els.statusDot.classList.add('connected');
            this.els.statusText.textContent = `${provLabel} 已同步 (${this.health.state.lastSyncedAt})`;
        } else {
            this.els.statusDot.classList.remove('connected');
            this.els.statusText.textContent = `${provLabel} · 本地科学评估模式`;
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
        this.els.planTotalEst.textContent = `预计 ${estMinutes} 分钟 · 共 ${exercises.length} 个动作`;
        this.els.planList.innerHTML = '';

        exercises.forEach((ex, idx) => {
            const card = document.createElement('div');
            card.className = 'ex-card';
            card.dataset.exIdx = idx;
            card.innerHTML = `
                <div class="ex-card-left">
                    <div class="ex-title-row">
                        <span class="ex-index">${idx + 1}</span>
                        <span class="ex-name">${ex.name}</span>
                        <span class="ex-muscle-tag">${ex.muscle}</span>
                    </div>
                    <div class="ex-cue">${ex.repHint}</div>
                </div>
                <div class="ex-card-right">
                    <div class="ex-Prescription">${ex.sets}组 × ${ex.workSecs}s</div>
                    <div class="ex-rest-note">休 ${ex.restSecs}s</div>
                </div>
            `;
            this.els.planList.appendChild(card);
        });

        // 5. Update Cardio Synergy Recommendation
        this.els.synergyDesc.textContent = readiness.cardioPrescription.desc;
    }

    buildWorkoutTimeline() {
        const exercises = this.currentPlan ? this.currentPlan.exercises : [];
        const steps = [];

        if (exercises.length === 0) return steps;

        // Initial 5s Prep
        steps.push({
            type: 'prep',
            duration: 5,
            exIndex: 0,
            exName: `准备：${exercises[0].name}`,
            setNum: 1,
            totalSets: exercises[0].sets,
            cue: exercises[0].repHint,
            nextLabel: `即将开始：${exercises[0].name} 第 1 组`
        });

        exercises.forEach((ex, exIdx) => {
            for (let s = 1; s <= ex.sets; s++) {
                const isLastSetOfEx = (s === ex.sets);
                const isLastExercise = (exIdx === exercises.length - 1);

                let nextAfterWork = '';
                if (isLastSetOfEx && isLastExercise) {
                    nextAfterWork = '下一项：完成全部训练！';
                } else if (isLastSetOfEx) {
                    nextAfterWork = `下一项：组间休息 ${ex.restSecs}s → ${exercises[exIdx + 1].name}`;
                } else {
                    nextAfterWork = `下一项：组间休息 ${ex.restSecs}s`;
                }

                steps.push({
                    type: 'work',
                    duration: ex.workSecs,
                    exIndex: exIdx,
                    exName: ex.name,
                    setNum: s,
                    totalSets: ex.sets,
                    cue: ex.repHint,
                    nextLabel: nextAfterWork
                });

                // Add Rest unless it's the very last set of the very last exercise
                if (!(isLastSetOfEx && isLastExercise)) {
                    const nextEx = isLastSetOfEx ? exercises[exIdx + 1] : ex;
                    const nextSetNum = isLastSetOfEx ? 1 : s + 1;
                    steps.push({
                        type: 'rest',
                        duration: ex.restSecs,
                        exIndex: isLastSetOfEx ? exIdx + 1 : exIdx,
                        exName: '组间休息 · 调整呼吸',
                        setNum: nextSetNum,
                        totalSets: nextEx.sets,
                        cue: `下一动作要领：${nextEx.repHint}`,
                        nextLabel: `即将进入：${nextEx.name} (第 ${nextSetNum}/${nextEx.sets} 组)`
                    });
                }
            }
        });

        return steps;
    }

    async startGuidedWorkout() {
        await this.app.requestAudio();
        await this.app.requestWakeLock();

        this.timeline = this.buildWorkoutTimeline();
        if (this.timeline.length === 0) return;

        this.stepIndex = 0;
        this.timeLeft = this.timeline[0].duration;
        this.elapsedTotal = 0;
        this.totalWorkoutSecs = this.timeline.reduce((acc, st) => acc + st.duration, 0);

        this.isRunning = true;
        this.els.playerPanel.classList.remove('hidden');
        this.els.bottomBar.classList.add('hidden');
        this.els.pauseBtn.textContent = '暂停';

        this.app.audio.playWorkBeep();
        this.renderPlayerStep();
        this.app.startWorker();

        // Scroll player into view smoothly
        this.els.playerPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

    renderPlayerStep() {
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
        this.stepIndex++;
        if (this.stepIndex >= this.timeline.length) {
            // Completed all steps!
            this.app.audio.playFinish();
            this.isRunning = false;
            this.app.stopWorker();
            this.app.releaseWakeLock();

            this.els.phaseBadge.textContent = '训练完成';
            this.els.phaseBadge.className = 'phase-pill work';
            this.els.currentExName.textContent = '今日力量处方已完成！';
            this.els.currentExTarget.textContent = '可点击下方「去慢跑」继续完成心肺燃脂联动';
            this.els.timerDisplay.textContent = 'DONE';
            this.els.totalProgress.style.width = '100%';
            this.els.bottomBar.classList.remove('hidden');
            this.highlightExerciseCard(-1);
            return;
        }

        const nextStep = this.timeline[this.stepIndex];
        this.timeLeft = nextStep.duration;
        if (nextStep.type === 'work') {
            this.app.audio.playWorkBeep();
        } else {
            this.app.audio.playRestBeep();
        }
        this.renderPlayerStep();
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
                this.renderPlayerStep();
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

        // Check if returning from Google / Fitbit OAuth 2.0 Redirect
        if (this.strength.health.consumeOAuthRedirectHash()) {
            this.switchMode('strength');
            this.strength.health.fetchCloudMetrics()
                .then(() => {
                    this.strength.refreshPrescription();
                })
                .catch(err => {
                    this.strength.openModal();
                    this.strength.showApiFeedback(err.message, 'error');
                });
        }
    }

    switchMode(mode) {
        if (this.mode === mode) return;

        // Stop current
        this.activeController.stop();

        // Switch
        this.mode = mode;
        if (mode === 'niko') this.activeController = this.niko;
        else if (mode === 'interval') this.activeController = this.interval;
        else this.activeController = this.strength;

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
