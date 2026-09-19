import { useState, type CSSProperties } from 'react';
import { Box, Check, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { MATERIALS, isGlass, type MaterialId } from '@/lib/materials';
import { SHAPE_NAMES, type BlockShape } from '@/lib/block-types';
const CATEGORIES = ['基本', 'カラー', '建築', 'ガラス', '自然'] as const;
export function MaterialPicker({
  material,
  shape,
  onChange,
}: {
  material: MaterialId;
  shape: BlockShape;
  onChange: (material: MaterialId, shape: BlockShape) => void;
}) {
  const [open, setOpen] = useState(false),
    [category, setCategory] = useState<(typeof CATEGORIES)[number]>('基本');
  const current = MATERIALS.find((m) => m.id === material)!;
  const shapes: BlockShape[] =
    category === '建築'
      ? [
          'slab',
          'stairs',
          'fence',
          'door',
          'gridWindow',
          'roofSlope',
          'roofRidge',
          'lamp',
        ]
      : category === 'ガラス'
        ? ['cube', 'glassPane']
        : category === '自然'
          ? ['cube', 'waterSource']
          : ['cube'];
  const [buildingShape, setBuildingShape] = useState<BlockShape>('stairs');
  const selectedShape = shapes.includes(buildingShape)
    ? buildingShape
    : shapes[0];
  const materials = MATERIALS.filter((m) =>
    category === '建築'
      ? !isGlass(m.id) && !['grass', 'leaf', 'water', 'sand'].includes(m.id)
      : category === 'カラー'
        ? m.category === 'カラー' || m.id === 'white'
        : m.category === category,
  );
  return (
    <>
      <Button
        variant="outline"
        className="picker-launch"
        onClick={() => setOpen(true)}
        aria-label="素材と形を選ぶ"
      >
        <span
          className={`part-icon part-${shape}`}
          style={{ '--block-color': current.color } as CSSProperties}
        >
          <Box />
        </span>
        <span>
          <strong>
            {current.name} · {SHAPE_NAMES[shape]}
          </strong>
          <small>素材と形を選ぶ</small>
        </span>
        <ChevronRight size={18} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="game-dialog material-dialog">
          <DialogTitle>好きな素材で、自由に建築</DialogTitle>
          <DialogDescription>
            カテゴリ → 形 → 色を選びます。すべて無料。
          </DialogDescription>
          <div className="category-tabs">
            {CATEGORIES.map((c) => (
              <Button
                variant="ghost"
                key={c}
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
              >
                {c}
              </Button>
            ))}
          </div>
          <div className="shape-tabs">
            {shapes.map((s) => (
              <Button
                variant="outline"
                key={s}
                aria-pressed={selectedShape === s}
                onClick={() => setBuildingShape(s)}
              >
                {SHAPE_NAMES[s]}
              </Button>
            ))}
          </div>
          <div className="material-grid">
            {materials
              .filter(
                (m) => selectedShape !== 'waterSource' || m.id === 'water',
              )
              .map((m) => (
                <Button
                  variant="ghost"
                  key={m.id}
                  className="material-card"
                  aria-label={`${m.name}の${SHAPE_NAMES[selectedShape]}を選ぶ`}
                  aria-pressed={material === m.id && shape === selectedShape}
                  onClick={() => {
                    onChange(
                      m.id,
                      m.id === 'water'
                        ? 'waterSource'
                        : m.id === 'light' && selectedShape === 'cube'
                          ? 'lamp'
                          : selectedShape,
                    );
                    setOpen(false);
                  }}
                >
                  <span
                    className={`part-icon part-${selectedShape}`}
                    style={{ '--block-color': m.color } as CSSProperties}
                  >
                    <Box />
                  </span>
                  <span>{m.name}</span>
                  {material === m.id && shape === selectedShape && (
                    <Check size={12} />
                  )}
                </Button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
