export class TrajectoryPlayer {
    constructor(moleculeRenderer, trajectoryData) {
        this.renderer = moleculeRenderer;
        this.trajectory = trajectoryData;
        this.isPlaying = false;
        this.currentFrameIndex = 0;
        this.playbackRate = 1.0;
        this.loop = true;
        this.interpolate = true;
        
        this.framePositions = [];
        this._precomputeFramePositions();
        
        this.lastFrameTime = 0;
        this.frameDuration = 1000 / 30;
        
        this.onFrameChange = null;
        this.onPlayStateChange = null;
    }
    
    _precomputeFramePositions() {
        this.framePositions = this.trajectory.frames.map(frame => {
            return frame.atoms.map(atom => [atom.x, atom.y, atom.z]);
        });
    }
    
    setTrajectory(trajectoryData) {
        this.trajectory = trajectoryData;
        this.currentFrameIndex = 0;
        this._precomputeFramePositions();
        this.goToFrame(0);
    }
    
    play() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.lastFrameTime = performance.now();
        if (this.onPlayStateChange) this.onPlayStateChange(true);
    }
    
    pause() {
        this.isPlaying = false;
        if (this.onPlayStateChange) this.onPlayStateChange(false);
    }
    
    togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
        return this.isPlaying;
    }
    
    stop() {
        this.pause();
        this.goToFrame(0);
    }
    
    goToFrame(frameIndex) {
        const totalFrames = this.trajectory.getFrameCount();
        frameIndex = Math.max(0, Math.min(totalFrames - 1, Math.floor(frameIndex)));
        
        this.currentFrameIndex = frameIndex;
        
        const positions = this.framePositions[frameIndex];
        if (positions) {
            this.renderer.updateAtomPositions(positions);
        }
        
        if (this.onFrameChange) {
            this.onFrameChange(frameIndex, this.trajectory.frames[frameIndex]);
        }
    }
    
    goToTime(time) {
        const totalTime = this.trajectory.getTotalTime();
        const timeStep = this.trajectory.getTimeStep();
        const frameIndex = Math.floor(time / timeStep);
        this.goToFrame(frameIndex);
    }
    
    nextFrame() {
        const totalFrames = this.trajectory.getFrameCount();
        let nextFrame = this.currentFrameIndex + 1;
        
        if (nextFrame >= totalFrames) {
            if (this.loop) {
                nextFrame = 0;
            } else {
                this.pause();
                return;
            }
        }
        
        this.goToFrame(nextFrame);
    }
    
    prevFrame() {
        const totalFrames = this.trajectory.getFrameCount();
        let prevFrame = this.currentFrameIndex - 1;
        
        if (prevFrame < 0) {
            if (this.loop) {
                prevFrame = totalFrames - 1;
            } else {
                return;
            }
        }
        
        this.goToFrame(prevFrame);
    }
    
    update(currentTime) {
        if (!this.isPlaying) return;
        
        const deltaTime = currentTime - this.lastFrameTime;
        const frameInterval = this.frameDuration / this.playbackRate;
        
        if (deltaTime >= frameInterval) {
            const framesToAdvance = Math.floor(deltaTime / frameInterval);
            this.lastFrameTime += framesToAdvance * frameInterval;
            
            for (let i = 0; i < framesToAdvance; i++) {
                this.nextFrame();
                if (!this.isPlaying) break;
            }
        } else if (this.interpolate && this.playbackRate <= 1.0) {
            this._updateInterpolation(currentTime);
        }
    }
    
    _updateInterpolation(currentTime) {
        const totalFrames = this.trajectory.getFrameCount();
        if (totalFrames < 2) return;
        
        const frameInterval = this.frameDuration / this.playbackRate;
        const t = (currentTime - this.lastFrameTime) / frameInterval;
        
        if (t > 0 && t < 1) {
            const frameA = this.currentFrameIndex;
            let frameB = frameA + 1;
            
            if (frameB >= totalFrames) {
                if (this.loop) {
                    frameB = 0;
                } else {
                    return;
                }
            }
            
            const posA = this.framePositions[frameA];
            const posB = this.framePositions[frameB];
            
            if (posA && posB) {
                this.renderer.updateAtomPositionsInterpolated(posA, posB, t);
            }
        }
    }
    
    setPlaybackRate(rate) {
        this.playbackRate = Math.max(0.0625, Math.min(16, rate));
    }
    
    setLoop(enabled) {
        this.loop = enabled;
    }
    
    setInterpolate(enabled) {
        this.interpolate = enabled;
    }
    
    getCurrentTime() {
        const frame = this.trajectory.getFrame(this.currentFrameIndex);
        return frame ? frame.time : 0;
    }
    
    getTotalTime() {
        return this.trajectory.getTotalTime();
    }
    
    getCurrentFrame() {
        return this.currentFrameIndex;
    }
    
    getTotalFrames() {
        return this.trajectory.getFrameCount();
    }
    
    destroy() {
        this.pause();
        this.trajectory = null;
        this.framePositions = [];
    }
}

export class TrajectoryUIController {
    constructor(container, player) {
        this.container = container;
        this.player = player;
        
        this._createUI();
        this._bindEvents();
        this._updateUI();
    }
    
    _createUI() {
        this.container.innerHTML = `
            <div class="trajectory-controls">
                <div class="trajectory-header">
                    <h3>🎬 轨迹动画</h3>
                    <span id="trajectoryInfo" class="trajectory-info">--</span>
                </div>
                
                <div class="time-display">
                    <span id="currentTime">0.000</span> / 
                    <span id="totalTime">0.000</span> ps
                </div>
                
                <div class="progress-container">
                    <span id="frameLabel" class="frame-label">Frame: 0 / 0</span>
                    <input type="range" id="frameSlider" class="progress-slider" 
                           min="0" max="0" value="0" step="1">
                </div>
                
                <div class="control-buttons">
                    <button id="prevFrameBtn" class="control-btn-sm" title="上一帧">⏮</button>
                    <button id="playPauseBtn" class="control-btn-sm play-btn" title="播放/暂停">▶</button>
                    <button id="nextFrameBtn" class="control-btn-sm" title="下一帧">⏭</button>
                    <button id="stopBtn" class="control-btn-sm" title="停止">⏹</button>
                </div>
                
                <div class="speed-control">
                    <label for="speedSlider">速度:</label>
                    <input type="range" id="speedSlider" min="-4" max="4" value="0" step="1">
                    <span id="speedValue">1.0x</span>
                </div>
                
                <div class="options-row">
                    <label class="checkbox-label">
                        <input type="checkbox" id="loopCheckbox" checked>
                        循环播放
                    </label>
                    <label class="checkbox-label">
                        <input type="checkbox" id="interpolateCheckbox" checked>
                        帧插值
                    </label>
                </div>
            </div>
        `;
        
        this.playPauseBtn = this.container.querySelector('#playPauseBtn');
        this.prevFrameBtn = this.container.querySelector('#prevFrameBtn');
        this.nextFrameBtn = this.container.querySelector('#nextFrameBtn');
        this.stopBtn = this.container.querySelector('#stopBtn');
        this.frameSlider = this.container.querySelector('#frameSlider');
        this.frameLabel = this.container.querySelector('#frameLabel');
        this.currentTimeLabel = this.container.querySelector('#currentTime');
        this.totalTimeLabel = this.container.querySelector('#totalTime');
        this.speedSlider = this.container.querySelector('#speedSlider');
        this.speedValue = this.container.querySelector('#speedValue');
        this.loopCheckbox = this.container.querySelector('#loopCheckbox');
        this.interpolateCheckbox = this.container.querySelector('#interpolateCheckbox');
        this.trajectoryInfo = this.container.querySelector('#trajectoryInfo');
    }
    
    _bindEvents() {
        this.playPauseBtn.addEventListener('click', () => {
            this.player.togglePlay();
        });
        
        this.prevFrameBtn.addEventListener('click', () => {
            this.player.prevFrame();
        });
        
        this.nextFrameBtn.addEventListener('click', () => {
            this.player.nextFrame();
        });
        
        this.stopBtn.addEventListener('click', () => {
            this.player.stop();
        });
        
        this.frameSlider.addEventListener('input', (e) => {
            const frame = parseInt(e.target.value);
            this.player.goToFrame(frame);
        });
        
        this.speedSlider.addEventListener('input', (e) => {
            const power = parseInt(e.target.value);
            const rate = Math.pow(2, power);
            this.player.setPlaybackRate(rate);
            this.speedValue.textContent = `${rate.toFixed(1)}x`;
        });
        
        this.loopCheckbox.addEventListener('change', (e) => {
            this.player.setLoop(e.target.checked);
        });
        
        this.interpolateCheckbox.addEventListener('change', (e) => {
            this.player.setInterpolate(e.target.checked);
        });
        
        this.player.onFrameChange = (frameIndex, frame) => {
            this._updateFrameUI(frameIndex);
        };
        
        this.player.onPlayStateChange = (isPlaying) => {
            this._updatePlayButton(isPlaying);
        };
    }
    
    _updateUI() {
        const totalFrames = this.player.getTotalFrames();
        const totalTime = this.player.getTotalTime();
        
        this.frameSlider.max = Math.max(0, totalFrames - 1);
        this.totalTimeLabel.textContent = totalTime.toFixed(3);
        this.trajectoryInfo.textContent = `${totalFrames} 帧 · ${this.player.trajectory.filename}`;
        
        this._updateFrameUI(this.player.getCurrentFrame());
        this._updatePlayButton(this.player.isPlaying);
    }
    
    _updateFrameUI(frameIndex) {
        const totalFrames = this.player.getTotalFrames();
        const currentTime = this.player.getCurrentTime();
        
        this.frameSlider.value = frameIndex;
        this.frameLabel.textContent = `Frame: ${frameIndex + 1} / ${totalFrames}`;
        this.currentTimeLabel.textContent = currentTime.toFixed(3);
    }
    
    _updatePlayButton(isPlaying) {
        this.playPauseBtn.innerHTML = isPlaying ? '⏸' : '▶';
        this.playPauseBtn.classList.toggle('playing', isPlaying);
    }
    
    setPlayer(player) {
        this.player = player;
        this._bindEvents();
        this._updateUI();
    }
    
    show() {
        this.container.style.display = 'block';
    }
    
    hide() {
        this.container.style.display = 'none';
    }
    
    destroy() {
        this.container.innerHTML = '';
    }
}
