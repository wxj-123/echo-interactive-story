/**
 * 环境雨声：用 Web Audio 程序化合成，不依赖任何外部音频素材。
 * 好处是零版权风险、零加载耗时；坏处是不可能生成配乐，只能做氛围底噪。
 *
 * 做法：白噪声 → 低通滤波（雨打在窗上的闷响）→ 增益极低，长期循环。
 */
export class RainAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private targetVolume = 0.05;

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** 必须在用户手势（点击）中调用，否则浏览器会拒绝启动 AudioContext */
  async start(): Promise<void> {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();

      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.6;
      }

      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 1100;
      this.filter.Q.value = 0.4;

      this.master = this.ctx.createGain();
      this.master.gain.value = 0; // 淡入，避免一上来"啪"一声

      this.source = this.ctx.createBufferSource();
      this.source.buffer = buffer;
      this.source.loop = true;

      this.source.connect(this.filter).connect(this.master).connect(this.ctx.destination);
      this.source.start();
    }

    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.master?.gain.linearRampToValueAtTime(this.targetVolume, this.ctx.currentTime + 1.6);
  }

  /** 场景色调影响雨的"质感"：冷调更亮，暖调更闷 */
  setTone(tone: 'warm' | 'cold' | 'dark' = 'dark'): void {
    if (!this.filter || !this.ctx) return;
    const target = tone === 'warm' ? 720 : tone === 'cold' ? 1450 : 1050;
    this.filter.frequency.linearRampToValueAtTime(target, this.ctx.currentTime + 1.2);
  }

  async mute(): Promise<void> {
    if (!this.ctx || !this.master) return;
    this.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
    await new Promise((r) => setTimeout(r, 520));
    await this.ctx.suspend();
  }

  async unmute(): Promise<void> {
    if (!this.ctx) {
      await this.start();
      return;
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.master?.gain.linearRampToValueAtTime(this.targetVolume, this.ctx.currentTime + 0.8);
  }

  dispose(): void {
    try {
      this.source?.stop();
      void this.ctx?.close();
    } catch {
      /* 已关闭时忽略 */
    }
    this.ctx = null;
  }
}
