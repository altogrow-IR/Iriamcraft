import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  deleteBlueprint,
  renameBlueprint,
  saveBlueprint,
} from '@/lib/blueprint-storage';
import {
  createBlueprint,
  isTerrain,
  type CustomBlueprint,
} from '@/lib/custom-blueprints';
import type { Block } from '@/lib/block-types';

export function BlueprintSaveDialog({
  blocks,
  number,
  onClose,
  onSaved,
}: {
  blocks: Block[];
  number: number;
  onClose: () => void;
  onSaved: (p: CustomBlueprint) => void;
}) {
  const [name, setName] = useState(`マイ設計図 ${number}`),
    [include, setInclude] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const count = blocks.filter((b) => include || !isTerrain(b)).length;
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent>
        <DialogTitle>設計図の名前</DialogTitle>
        <DialogDescription>
          {count.toLocaleString()}ブロックを設計図に保存します
        </DialogDescription>
        <form
          className="blueprint-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              const p = createBlueprint(blocks, name, include);
              await saveBlueprint(p);
              onSaved(p);
              onClose();
            } catch {
              setError(
                '設計図を保存できませんでした。不要な設計図を削除してもう一度試してください。',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            名前
            <input
              maxLength={30}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="terrain-option">
            <input
              type="checkbox"
              checked={include}
              onChange={(e) => setInclude(e.target.checked)}
            />
            地面ブロックも含める
          </label>
          {!count && (
            <p>
              保存するブロックがありません。地面を含めるか範囲を選び直してください。
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={busy || !count || !name.trim()}>
              {busy ? '保存中…' : '保存'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function MyBlueprints({
  plans,
  selected,
  onSelect,
  onChange,
}: {
  plans: CustomBlueprint[];
  selected?: string;
  onSelect: (p: CustomBlueprint) => void;
  onChange: (plans: CustomBlueprint[]) => void;
}) {
  const [action, setAction] = useState<{
      plan: CustomBlueprint;
      mode: 'rename' | 'delete';
    }>(),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <section className="my-blueprints" aria-label="マイ設計図">
      <strong>マイ設計図</strong>
      {!plans.length && (
        <p>
          まだ設計図がありません
          <br />
          作った建物を範囲選択すると
          <br />
          設計図として保存できます
        </p>
      )}
      {plans.map((p) => (
        <article
          key={p.id}
          className={selected === p.id ? 'my-plan selected' : 'my-plan'}
        >
          <div>
            <strong>{p.name}</strong>
            <small>
              {p.blocks.length.toLocaleString()}ブロック · 幅 {p.size.x} × 高さ{' '}
              {p.size.y} × 奥行 {p.size.z}
            </small>
          </div>
          <Button variant="outline" onClick={() => onSelect(p)}>
            配置
          </Button>
          <details>
            <summary aria-label={`${p.name}のメニュー`}>管理</summary>
            <Button
              variant="ghost"
              onClick={() => {
                setAction({ plan: p, mode: 'rename' });
                setName(p.name);
                setError('');
              }}
            >
              名前を変更
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setAction({ plan: p, mode: 'delete' });
                setError('');
              }}
            >
              削除
            </Button>
          </details>
        </article>
      ))}
      <Dialog
        open={!!action}
        onOpenChange={(v) => !v && !busy && setAction(undefined)}
      >
        <DialogContent>
          <DialogTitle>
            {action?.mode === 'delete'
              ? `「${action.plan.name}」を削除しますか？`
              : '設計図の名前を変更'}
          </DialogTitle>
          <DialogDescription>
            {action?.mode === 'delete'
              ? 'この操作は元に戻せません。'
              : '30文字まで入力できます。'}
          </DialogDescription>
          <form
            className="blueprint-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!action) return;
              setBusy(true);
              try {
                if (action.mode === 'delete') {
                  await deleteBlueprint(action.plan.id);
                  onChange(plans.filter((p) => p.id !== action.plan.id));
                } else {
                  await renameBlueprint(action.plan.id, name);
                  onChange(
                    plans.map((p) =>
                      p.id === action.plan.id
                        ? { ...p, name: name.trim(), updatedAt: Date.now() }
                        : p,
                    ),
                  );
                }
                setAction(undefined);
              } catch {
                setError(
                  '設計図を更新できませんでした。もう一度試してください。',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {action?.mode === 'rename' && (
              <label>
                名前
                <input
                  maxLength={30}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}
            {error && <p role="alert">{error}</p>}
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setAction(undefined)}
              >
                キャンセル
              </Button>
              <Button
                type="submit"
                disabled={busy || (action?.mode === 'rename' && !name.trim())}
              >
                {action?.mode === 'delete' ? '削除' : '保存'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
