'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Box,
  Layers3,
  Sparkles,
  Undo2,
  Redo2,
  Plus,
  Minus,
  RotateCw,
  Move,
  Hammer,
  Eraser,
  Sun,
  Moon,
  Camera,
  Settings2,
  HelpCircle,
  Check,
  ChevronRight,
  Radio,
  X,
  Heart,
  Star,
  Users,
  Flower2,
  Armchair,
  Music2,
  Flag,
  Maximize,
  Download,
  Upload,
  Volume2,
  VolumeX,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Grid2X2,
  Crosshair,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  initialWorld,
  MATERIALS,
  blueprint,
  brushBlocks,
  place,
  remove,
  key,
  parseWorld,
  liveScore,
  type World,
  type Point,
  type MaterialId,
  type Brush,
  type Blueprint,
} from '@/lib/world';
import { IslandEngine } from './engine';
import { registerWorldTools } from '@/lib/webmcp';

const SAVE_KEY = 'iriamcraft-world-v1';
const BLUEPRINTS = [
  {
    id: 'stage' as const,
    name: '配信ステージ',
    icon: Music2,
    desc: 'みんなが集まる場所',
  },
  {
    id: 'tree' as const,
    name: 'さくらの木',
    icon: Flower2,
    desc: '島をピンクに彩る',
  },
  {
    id: 'bench' as const,
    name: 'おしゃべりベンチ',
    icon: Armchair,
    desc: 'ちょっと、ひとやすみ',
  },
  {
    id: 'arch' as const,
    name: 'ウェルカムアーチ',
    icon: Flag,
    desc: '出会いの入り口',
  },
];
export default function Game() {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<IslandEngine | null>(null);
  const [world, setWorld] = useState<World>(initialWorld),
    worldRef = useRef(world);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState(false);
  const [selection, setSelection] = useState<Point>({ x: 0, y: 1, z: 4 }),
    [hit, setHit] = useState<Point>({ x: 0, y: 0, z: 4 });
  const [material, setMaterial] = useState<MaterialId>('pink'),
    [brush, setBrush] = useState<Brush>('single'),
    [rotation, setRotation] = useState(0);
  const [tab, setTab] = useState<'blocks' | 'blueprints'>('blocks'),
    [plan, setPlan] = useState<Blueprint>('bench');
  const [erase, setErase] = useState(false),
    [night, setNight] = useState(false),
    [sound, setSound] = useState(false);
  const [live, setLive] = useState(false),
    [seconds, setSeconds] = useState(0),
    [result, setResult] = useState(false);
  const [modal, setModal] = useState<'help' | 'settings' | null>(null),
    [expanded, setExpanded] = useState(false);
  const [toast, setToast] = useState(''),
    [saved, setSaved] = useState('保存済み'),
    [showHint, setShowHint] = useState(true);
  const [history, setHistory] = useState<World[]>([]),
    [future, setFuture] = useState<World[]>([]);
  const fileInput = useRef<HTMLInputElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    audio = useRef<AudioContext | null>(null);
  const saveAllowed = useRef(true);
  const liveRef = useRef(live);
  liveRef.current = live;
  const finishRef = useRef(() => {});
  const pending =
    tab === 'blueprints'
      ? blueprint(plan, selection, rotation)
      : brushBlocks(selection, material, brush, rotation);
  const validation = place(world, pending),
    score = liveScore(world);
  const canRemove = world.blocks.some((b) => key(b) === key(hit)) && hit.y > 0;
  const level = 1 + Math.floor(world.placed / 50);
  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }
  function chime() {
    if (!sound) return;
    try {
      const ctx = audio.current ?? new AudioContext();
      audio.current = ctx;
      void ctx.resume();
      [523.25, 659.25, 783.99].forEach((f, i) => {
        const o = ctx.createOscillator(),
          g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0, ctx.currentTime + i * 0.065);
        g.gain.linearRampToValueAtTime(
          0.055,
          ctx.currentTime + i * 0.065 + 0.01,
        );
        g.gain.exponentialRampToValueAtTime(
          0.001,
          ctx.currentTime + i * 0.065 + 0.25,
        );
        o.connect(g);
        g.connect(ctx.destination);
        o.start(ctx.currentTime + i * 0.065);
        o.stop(ctx.currentTime + i * 0.065 + 0.26);
      });
    } catch {
      /* Sound is optional on browsers without audio support. */
    }
  }
  function commit(next: World) {
    saveAllowed.current = true;
    const previous = worldRef.current;
    setHistory((h) => [...h.slice(-39), previous]);
    setFuture([]);
    worldRef.current = next;
    setWorld(next);
    if (next.blocks.length > previous.blocks.length)
      engine.current?.celebrate(next.blocks.at(-1)!);
  }
  function build() {
    if (!ready || live) return;
    if (erase) {
      if (!canRemove) {
        notify('地面は残して、その上のブロックを選んでね');
        return;
      }
      commit(remove(world, hit));
      notify('ブロックを取り外しました');
    } else {
      if (validation.error) {
        notify(validation.error);
        return;
      }
      commit(validation.world);
      chime();
      setShowHint(false);
      notify(
        tab === 'blueprints'
          ? `${BLUEPRINTS.find((b) => b.id === plan)!.name}ができました！`
          : `${pending.length}ブロック、いい感じ！`,
      );
      setSelection((p) => ({ ...p, y: p.y + 1 }));
    }
  }
  function undo() {
    const prev = history.at(-1);
    if (!prev || live) return;
    setFuture((f) => [worldRef.current, ...f]);
    setHistory((h) => h.slice(0, -1));
    worldRef.current = prev;
    setWorld(prev);
    notify('ひとつ前に戻しました');
  }
  function redo() {
    const next = future[0];
    if (!next || live) return;
    setHistory((h) => [...h, worldRef.current]);
    setFuture((f) => f.slice(1));
    worldRef.current = next;
    setWorld(next);
  }
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const w = parseWorld(raw);
        setWorld(w);
        worldRef.current = w;
        setShowHint(w.placed === 0);
      }
    } catch {
      saveAllowed.current = false;
      setSaved('保存データを確認');
      notify(
        '保存データを読み込めませんでした。設定からバックアップを読み込めます',
      );
    }
    setLoaded(true);
    if (!host.current) return;
    const fail = (e: Event) => setError((e as CustomEvent<string>).detail);
    host.current.addEventListener('island-error', fail);
    try {
      const e = new IslandEngine(host.current, (p, n) => {
        setHit(p);
        setSelection({ x: p.x + n.x, y: p.y + n.y, z: p.z + n.z });
      });
      engine.current = e;
      e.setBlocks(worldRef.current.blocks);
      setReady(true);
    } catch {
      setError(
        'このブラウザで3D表示を開始できませんでした。最新版のChromeやSafariで開いてください。',
      );
    }
    const node = host.current;
    return () => {
      engine.current?.dispose();
      engine.current = null;
      node.removeEventListener('island-error', fail);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      void audio.current?.close();
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    engine.current?.setBlocks(world.blocks);
    worldRef.current = world;
  }, [world]);
  useEffect(
    () =>
      registerWorldTools(
        () => worldRef.current,
        (blocks) => {
          if (liveRef.current)
            return { error: 'ライブ中は建築をお休みしています', count: 0 };
          const result = place(worldRef.current, blocks);
          if (result.error) return { error: result.error, count: 0 };
          commit(result.world);
          return { count: blocks.length };
        },
      ),
    [],
  );
  useEffect(() => {
    engine.current?.setGhost(
      live ? [] : erase ? [hit] : pending,
      erase ? canRemove : !validation.error,
      erase,
    );
  }, [pending, hit, erase, live, canRemove, validation.error]);
  useEffect(() => {
    engine.current?.setNight(night);
  }, [night]);
  useEffect(() => {
    engine.current?.setLive(live, score.visitors);
  }, [live, score.visitors]);
  useEffect(() => {
    if (!loaded || !saveAllowed.current) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(world));
      setSaved('保存済み');
    } catch {
      setSaved('保存できません');
    }
  }, [world, loaded]);
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [live]);
  useEffect(() => {
    if (live && seconds >= 30) finishRef.current();
  }, [seconds, live]);
  function finishLive() {
    setLive(false);
    setResult(true);
    const next = { ...worldRef.current, shows: worldRef.current.shows + 1 };
    worldRef.current = next;
    setWorld(next);
    chime();
  }
  finishRef.current = finishLive;
  function startLive() {
    setLive(true);
    setSeconds(0);
    setExpanded(false);
    notify('あなたの島で、ライブがはじまります！');
    chime();
  }
  function download(url: string, name: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
  }
  function exportWorld() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(world, null, 2)], { type: 'application/json' }),
    );
    download(url, 'iriamcraft-world.json');
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    notify('島のバックアップを書き出しました');
  }
  function photo() {
    if (!engine.current) return;
    download(engine.current.screenshot(), 'iriamcraft-island.png');
    notify('島の写真を保存しました');
  }
  const nudge = (axis: 'x' | 'y' | 'z', d: number) => {
    const move = (p: Point) => ({
      ...p,
      [axis]: Math.max(
        axis === 'y' ? 0 : -14,
        Math.min(axis === 'y' ? 15 : 14, p[axis] + d),
      ),
    });
    setSelection(move);
    setHit(move);
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        modal ||
        result ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === 'Enter' && e.target === document.body) {
        e.preventDefault();
        build();
      }
      if (e.key === 'Escape') {
        setErase(false);
        setExpanded(false);
      }
      if (e.target !== document.body) return;
      const moves: Record<string, ['x' | 'y' | 'z', number]> = {
        ArrowLeft: ['x', -1],
        ArrowRight: ['x', 1],
        ArrowUp: ['z', -1],
        ArrowDown: ['z', 1],
        PageUp: ['y', 1],
        PageDown: ['y', -1],
      };
      if (moves[e.key]) {
        e.preventDefault();
        nudge(...moves[e.key]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
  return (
    <main className={`game ${night ? 'night' : ''}`}>
      <header className="topbar">
        <a className="brand" href="./" aria-label="Iriamcraft ホーム">
          <span className="brand-mark">
            <Box strokeWidth={1.8} />
          </span>
          <span>
            Iriam<span className="brand-light">craft</span>
            <small>あなたの好きが、世界になる。</small>
          </span>
          <span className="beta">BETA</span>
        </a>
        <div className="header-center">
          <span className="status-dot" />
          マイワールド
          <span className="divider" />
          クリエイティブ
        </div>
        <div className="header-actions">
          <span
            className={`save-state ${saved !== '保存済み' ? 'save-error' : ''}`}
          >
            <Check size={14} />
            {saved}
          </span>
          <Button
            variant="ghost"
            className="icon-button"
            aria-label="遊び方"
            onClick={() => setModal('help')}
          >
            <HelpCircle />
          </Button>
          <Button
            variant="ghost"
            className="icon-button"
            aria-label="設定と保存"
            onClick={() => setModal('settings')}
          >
            <Settings2 />
          </Button>
          <span className="profile">
            K<span />
          </span>
        </div>
      </header>
      <section className="playground" aria-label="建築ワールド">
        <div ref={host} className="world-canvas" />
        {!ready && !error && (
          <div className="loading">
            <Box />
            <p>あなたの浮島を準備中…</p>
          </div>
        )}
        {error && (
          <div className="engine-error">
            <Box />
            <h2>3Dの島を表示できません</h2>
            <p>{error}</p>
            <Button onClick={() => location.reload()}>再読み込み</Button>
            <Button variant="outline" onClick={exportWorld}>
              島のデータを保存
            </Button>
          </div>
        )}
        <aside className="world-info glass-panel">
          <div className="eyebrow">
            <span className="tiny-island">
              <Box size={15} />
            </span>{' '}
            MY LITTLE UNIVERSE
          </div>
          <h1>
            {world.name}
            <Sparkles size={19} />
          </h1>
          <p>つくろう。ここが、あなたの居場所。</p>
          <div className="world-stats">
            <span>
              <Box size={14} />
              {world.blocks.length.toLocaleString()}
              <small>ブロック</small>
            </span>
            <span>
              <Users size={14} />
              {live ? score.visitors : 4}
              <small>住人</small>
            </span>
          </div>
          <div className="level-line">
            <span>
              Lv. {level}{' '}
              <b>
                {level === 1 ? 'かけだしクリエイター' : 'ワールドクリエイター'}
              </b>
            </span>
            <span>{world.placed % 50} / 50</span>
          </div>
          <div className="level-track">
            <span style={{ width: `${(world.placed % 50) * 2}%` }} />
          </div>
        </aside>
        <aside className="quest-card glass-panel">
          <div className="quest-heading">
            <span>
              <Star size={16} /> 今日のひらめき
            </span>
            <span>01</span>
          </div>
          <h2>
            {world.placed >= 10
              ? 'その調子！ライブを開こう'
              : 'あなたらしさを、ひとつ。'}
          </h2>
          <p>
            {world.placed >= 10
              ? 'できた島に、みんなをご招待。'
              : '好きなブロックを10個置いてみよう。'}
          </p>
          <div className="quest-bottom">
            <span>
              <Sparkles size={14} /> はじめの一歩
            </span>
            <b>
              {Math.min(world.placed, 10)} / 10{' '}
              {world.placed >= 10 && <Check size={13} />}
            </b>
          </div>
        </aside>
        <div className="sky-tag">
          <span className="status-dot" />
          {night ? '星降る夜' : 'おだやかな昼'}
          <span> • </span>そらの島
        </div>
        <div className="camera-tools glass-panel">
          <Button
            variant="ghost"
            className="icon-button"
            onClick={() => setNight((v) => !v)}
            aria-label={night ? '昼にする' : '夜にする'}
          >
            {night ? <Moon /> : <Sun />}
          </Button>
          <span />
          <Button
            variant="ghost"
            className="icon-button"
            onClick={photo}
            disabled={!ready}
            aria-label="島の写真を保存"
          >
            <Camera />
          </Button>
          <Button
            variant="ghost"
            className="icon-button"
            onClick={() => engine.current?.top()}
            aria-label="真上から見る"
          >
            <Grid2X2 />
          </Button>
          <Button
            variant="ghost"
            className="icon-button"
            onClick={() => engine.current?.home()}
            aria-label="視点をリセット"
          >
            <Maximize />
          </Button>
        </div>
        <div className="orbit-tools">
          <Button
            className="round-button"
            variant="outline"
            onClick={() => engine.current?.rotate(-1)}
            aria-label="左に回転"
          >
            <RotateCw className="flip" />
          </Button>
          <div className="zoom-tools glass-panel">
            <Button
              variant="ghost"
              className="icon-button"
              onClick={() => engine.current?.zoom(-0.2)}
              aria-label="縮小"
            >
              <Minus />
            </Button>
            <span />
            <Button
              variant="ghost"
              className="icon-button"
              onClick={() => engine.current?.zoom(0.2)}
              aria-label="拡大"
            >
              <Plus />
            </Button>
          </div>
          <Button
            className="round-button"
            variant="outline"
            onClick={() => engine.current?.rotate()}
            aria-label="右に回転"
          >
            <RotateCw />
          </Button>
        </div>
        {showHint && !live && (
          <div className="world-hint">
            <span className="hint-icon">
              <Sparkles size={17} />
            </span>
            <div>
              <strong>思いついたら、置いてみよう。</strong>
              <span>島をタップで場所選び。ドラッグでぐるっと回転。</span>
            </div>
            <button
              aria-label="ヒントを閉じる"
              onClick={() => setShowHint(false)}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {!live && (
          <div className="live-launch">
            <span>この島に、みんなを呼ぼう。</span>
            <Button
              className="live-button"
              onClick={startLive}
              disabled={!ready}
            >
              <Radio size={18} />
              ライブをひらく
              <ChevronRight size={16} />
            </Button>
          </div>
        )}
        {live && (
          <div className="live-panel glass-panel">
            <div>
              <span className="live-badge">
                <span /> LIVE
              </span>
              <strong>{30 - seconds}s</strong>
              <Button
                variant="ghost"
                className="icon-button"
                onClick={finishLive}
                aria-label="ライブを終了"
              >
                <X />
              </Button>
            </div>
            <h2>ようこそ、わたしの島へ。</h2>
            <p>
              <Users size={16} /> {score.visitors}人が遊びに来ています
            </p>
            <div className="chat-line">
              <span>こはる</span>
              {seconds < 10
                ? 'この島、かわいい！'
                : seconds < 20
                  ? 'ステージの色、すき！'
                  : 'また遊びに来るね！'}
              <Heart size={14} />
            </div>
            <small>ゲーム内の住人によるライブシミュレーション</small>
          </div>
        )}
        <div className="scene-caption">
          <Move size={13} />
          ドラッグで回転<span> / </span>2本指で移動・拡大
        </div>
      </section>
      <section
        className={`build-dock ${expanded ? 'expanded' : ''} ${live ? 'dock-live' : ''}`}
        aria-label="建築ツール"
      >
        <div className="dock-top">
          <div className="dock-tabs">
            <Button
              variant="ghost"
              className={tab === 'blocks' ? 'dock-tab active' : 'dock-tab'}
              onClick={() => {
                setTab('blocks');
                setErase(false);
              }}
            >
              <Box size={17} />
              ブロック
            </Button>
            <Button
              variant="ghost"
              className={tab === 'blueprints' ? 'dock-tab active' : 'dock-tab'}
              onClick={() => {
                setTab('blueprints');
                setErase(false);
                setExpanded(true);
              }}
            >
              <Layers3 size={17} />
              設計図<span className="new-badge">かんたん</span>
            </Button>
          </div>
          <div className="dock-top-right">
            <span className="free-label">素材はぜんぶ、使い放題。</span>
            <Button
              variant="ghost"
              className="icon-button"
              aria-label="元に戻す"
              disabled={!history.length || live}
              onClick={undo}
            >
              <Undo2 />
            </Button>
            <Button
              variant="ghost"
              className="icon-button"
              aria-label="やり直す"
              disabled={!future.length || live}
              onClick={redo}
            >
              <Redo2 />
            </Button>
          </div>
        </div>
        <div className="dock-main">
          <div className="palette-wrap">
            {tab === 'blocks' ? (
              <div className="material-palette">
                {MATERIALS.slice(0, expanded ? 11 : 7).map((m, i) => (
                  <Button
                    variant="ghost"
                    key={m.id}
                    className={`material ${material === m.id && !erase ? 'selected' : ''}`}
                    aria-label={`${m.name}を選ぶ`}
                    aria-pressed={material === m.id && !erase}
                    onClick={() => {
                      setMaterial(m.id);
                      setErase(false);
                    }}
                  >
                    <span className="key-number">{i + 1}</span>
                    <span
                      className="voxel-icon"
                      style={{ '--block-color': m.color } as CSSProperties}
                    >
                      <Box size={31} strokeWidth={1.3} />
                    </span>
                    <span>{m.name}</span>
                    {material === m.id && !erase && (
                      <Check size={11} className="material-check" />
                    )}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  className="more-materials"
                  onClick={() => setExpanded((v) => !v)}
                  aria-label={expanded ? '素材を閉じる' : 'すべての素材'}
                >
                  {expanded ? <Minus /> : <Plus />}
                  <span>{expanded ? '閉じる' : 'もっと'}</span>
                </Button>
              </div>
            ) : (
              <div className="blueprint-palette">
                {BLUEPRINTS.map((b) => (
                  <Button
                    key={b.id}
                    variant="ghost"
                    className={`blueprint-card ${plan === b.id ? 'selected' : ''}`}
                    onClick={() => {
                      setPlan(b.id);
                      setErase(false);
                    }}
                  >
                    <b.icon />
                    <span>
                      <strong>{b.name}</strong>
                      <small>{b.desc}</small>
                    </span>
                  </Button>
                ))}
              </div>
            )}
          </div>
          <div className="build-controls">
            <div className="brush-controls">
              {tab === 'blocks' ? (
                <div className="segmented" aria-label="配置する形">
                  {(['single', 'line', 'floor'] as Brush[]).map((b, i) => (
                    <Button
                      variant="ghost"
                      key={b}
                      aria-pressed={brush === b}
                      className={brush === b ? 'active' : ''}
                      onClick={() => setBrush(b)}
                    >
                      {['1個', '3連', '3×3'][i]}
                    </Button>
                  ))}
                </div>
              ) : (
                <Button
                  className="rotate-plan"
                  variant="outline"
                  onClick={() => setRotation((r) => (r + 1) % 4)}
                >
                  <RotateCw size={15} /> 回転 {rotation * 90}°
                </Button>
              )}
              <Button
                variant="ghost"
                className={`erase-button ${erase ? 'active' : ''}`}
                onClick={() => setErase((v) => !v)}
                aria-label="取り外しモード"
                aria-pressed={erase}
              >
                <Eraser size={17} />
              </Button>
            </div>
            <Button
              className={`place-button ${erase ? 'erasing' : ''}`}
              disabled={!ready || live}
              onClick={build}
            >
              {erase ? <Eraser size={19} /> : <Plus size={21} />}
              <span>
                {erase
                  ? '取り外す'
                  : tab === 'blueprints'
                    ? 'まとめて建てる'
                    : 'ここに置く'}
              </span>
              <kbd>↵</kbd>
            </Button>
          </div>
        </div>
        <div className="dock-bottom">
          <span>
            <span className="status-dot" />
            {erase
              ? '取り外すブロックをタップ'
              : tab === 'blueprints'
                ? `${BLUEPRINTS.find((b) => b.id === plan)!.name}を選択中`
                : `${MATERIALS.find((m) => m.id === material)!.name}を選択中`}
            <span className="desktop-only">
              {' '}
              ·{' '}
              {erase
                ? '取り外しても、元に戻せます'
                : 'まずは気軽に、ひとつ置いてみよう'}
            </span>
          </span>
          <div className="position-controls">
            <Crosshair size={13} />
            <span>
              {selection.x}, {selection.z}
            </span>
            <button onClick={() => nudge('x', -1)} aria-label="配置位置を左へ">
              <ArrowLeft size={14} />
            </button>
            <button onClick={() => nudge('x', 1)} aria-label="配置位置を右へ">
              <ArrowRight size={14} />
            </button>
            <button onClick={() => nudge('z', -1)} aria-label="配置位置を奥へ">
              <ArrowUp size={14} />
            </button>
            <button onClick={() => nudge('z', 1)} aria-label="配置位置を手前へ">
              <ArrowDown size={14} />
            </button>
            <span className="height-label">高さ {selection.y}</span>
            <button onClick={() => nudge('y', -1)} aria-label="配置を一段下へ">
              <Minus size={14} />
            </button>
            <button onClick={() => nudge('y', 1)} aria-label="配置を一段上へ">
              <Plus size={14} />
            </button>
          </div>
        </div>
      </section>
      {toast && (
        <output className="toast">
          <Sparkles size={17} />
          {toast}
        </output>
      )}
      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <DialogContent className="game-dialog">
          <DialogTitle>
            {modal === 'help'
              ? '小さなひらめきから、世界をつくろう。'
              : 'あなたのワールド'}
          </DialogTitle>
          <DialogDescription>
            {modal === 'help'
              ? 'スマホは縦のまま。指ひとつで、建築をもっと自由に。'
              : 'この島は、いま使っているブラウザに自動保存されます。'}
          </DialogDescription>
          {modal === 'help' ? (
            <>
              <div className="help-steps">
                <p>
                  <b>01</b>
                  <span>
                    <strong>好きな素材を選ぶ</strong>
                    ブロック、または「設計図」を選びます。
                  </span>
                </p>
                <p>
                  <b>02</b>
                  <span>
                    <strong>島をタップして、場所を決める</strong>
                    緑は置ける場所。赤は重なりや範囲外です。
                  </span>
                </p>
                <p>
                  <b>03</b>
                  <span>
                    <strong>「ここに置く」で、できあがり！</strong>
                    3連・3×3で一気に建築。失敗は「戻す」で安心。
                  </span>
                </p>
              </div>
              <div className="help-note">
                ドラッグ：回転 / 2本指：移動・拡大
                <br />
                PC：矢印キーで位置調整、PageUp / Downで高さ、Enterで配置、Ctrl /
                ⌘ + Zで戻す。キーボード操作はボタン外をクリックしてから。
              </div>
              <p className="credits">
                IRIAMのキャラクター交流・配信文化に着想を得た非公式ファンゲームです。公式サービスへの接続や実際の配信機能はありません。
              </p>
            </>
          ) : (
            <>
              <label className="name-field">
                島の名前
                <input
                  maxLength={40}
                  value={world.name}
                  onChange={(e) => {
                    const next = { ...world, name: e.target.value };
                    worldRef.current = next;
                    setWorld(next);
                  }}
                />
              </label>
              <Button
                variant="outline"
                className="setting-row"
                onClick={() => setSound((v) => !v)}
              >
                {sound ? <Volume2 /> : <VolumeX />}建築の効果音
                <span>{sound ? 'ON' : 'OFF'}</span>
              </Button>
              <Button
                variant="outline"
                className="setting-row"
                onClick={exportWorld}
              >
                <Download />
                島のバックアップを保存
              </Button>
              <Button
                variant="outline"
                className="setting-row"
                onClick={() => fileInput.current?.click()}
              >
                <Upload />
                バックアップを読み込む
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    if (f.size > 1_500_000) throw Error();
                    const next = parseWorld(await f.text());
                    commit(next);
                    notify('島を読み込みました。「戻す」で前の島に戻せます');
                    setModal(null);
                  } catch {
                    notify(
                      'このファイルは読み込めません。IriamcraftのJSONを選んでください',
                    );
                  }
                  e.target.value = '';
                }}
              />
              <p className="credits">
                ブラウザのデータ消去に備えてバックアップを保存できます。端末間の自動同期はありません。
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={result} onOpenChange={setResult}>
        <DialogContent className="game-dialog result-dialog">
          <span className="result-star">
            <Star size={40} />
          </span>
          <DialogTitle>あなたの「好き」が、届いた！</DialogTitle>
          <DialogDescription>
            島に集まってくれて、ありがとう。
            <br />
            次はどんな場所をつくろう？
          </DialogDescription>
          <div className="result-stats">
            <span>
              <Users />
              {score.visitors}
              <small>遊びに来た住人</small>
            </span>
            <span>
              <Star />
              {score.stars}
              <small>今回のエール</small>
            </span>
          </div>
          <Button className="place-button" onClick={() => setResult(false)}>
            <Hammer size={18} />
            もっと、つくろう
          </Button>
        </DialogContent>
      </Dialog>
    </main>
  );
}
