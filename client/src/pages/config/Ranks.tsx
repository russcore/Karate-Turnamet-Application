import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../../lib/api';
import { useRanks, type Rank } from '../../lib/queries';
import { useI18n } from '../../i18n';
import BeltSwatch from '../../components/BeltSwatch';

function Row({ rank, ranks }: { rank: Rank; ranks: Rank[] }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['ranks'] });
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: rank.id });
  const [alias, setAlias] = useState('');
  const [mergeTo, setMergeTo] = useState<number | ''>('');

  const update = useMutation({ mutationFn: (data: any) => api.put(`/api/ranks/${rank.id}`, data), onSuccess: invalidate });
  const addAlias = useMutation({ mutationFn: () => api.post(`/api/ranks/${rank.id}/aliases`, { value: alias }), onSuccess: () => { setAlias(''); invalidate(); } });
  const delAlias = useMutation({ mutationFn: (aliasId: number) => api.del(`/api/ranks/aliases/${aliasId}`), onSuccess: invalidate });
  const remove = useMutation({
    mutationFn: () => api.del(`/api/ranks/${rank.id}`),
    onSuccess: invalidate,
    onError: (e: any) => alert(e.message || t('ranks.cannotDelete')),
  });
  const merge = useMutation({ mutationFn: () => api.post(`/api/ranks/${rank.id}/merge`, { targetRankId: mergeTo }), onSuccess: invalidate });

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="card p-3">
      <div className="flex items-center gap-2">
        <button className="cursor-grab px-1 text-slate-400" {...attributes} {...listeners}>⋮⋮</button>
        <BeltSwatch color={rank.beltColor} stripeColor={rank.stripeColor} stripeCount={rank.stripeCount} width={40} height={14} />
        <input type="color" title="Belt colour" className="h-8 w-9 rounded border" value={rank.beltColor} onChange={(e) => update.mutate({ beltColor: e.target.value })} />
        <input className="input flex-1" defaultValue={rank.name} onBlur={(e) => e.target.value !== rank.name && update.mutate({ name: e.target.value })} />
        <label className="flex items-center gap-1 text-xs text-slate-500" title="Stripe on the belt">
          <input
            type="checkbox"
            checked={!!rank.stripeColor}
            onChange={(e) => update.mutate(e.target.checked ? { stripeColor: '#111827', stripeCount: Math.max(1, rank.stripeCount) } : { stripeColor: null, stripeCount: 0 })}
          />
          stripe
        </label>
        {rank.stripeColor && (
          <>
            <input type="color" title="Stripe colour" className="h-8 w-9 rounded border" value={rank.stripeColor} onChange={(e) => update.mutate({ stripeColor: e.target.value })} />
            <input type="number" title="Stripe count" min={1} max={10} className="input w-14" value={rank.stripeCount} onChange={(e) => update.mutate({ stripeCount: Number(e.target.value) })} />
          </>
        )}
        <input className="input w-24" placeholder={t('ranks.shortCode')} defaultValue={rank.shortCode ?? ''} onBlur={(e) => update.mutate({ shortCode: e.target.value || null })} />
        <span className="badge bg-slate-100 text-slate-500">{rank.inUse} {t('ranks.inUse')}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
        <span className="text-xs font-semibold uppercase text-slate-400">{t('ranks.aliases')}:</span>
        {rank.aliases.map((a) => (
          <span key={a.id} className="badge bg-slate-100 text-slate-600">
            {a.value}
            <button className="ml-1 text-slate-400 hover:text-red-500" onClick={() => delAlias.mutate(a.id)}>×</button>
          </span>
        ))}
        <input
          className="input w-32 py-1 text-xs"
          placeholder="+ alias"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && alias && addAlias.mutate()}
        />
      </div>

      <div className="mt-2 flex items-center gap-2 pl-8">
        {rank.inUse > 0 ? (
          <>
            <select className="input w-48 py-1 text-xs" value={mergeTo} onChange={(e) => setMergeTo(Number(e.target.value))}>
              <option value="">{t('ranks.merge')}</option>
              {ranks.filter((r) => r.id !== rank.id).map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <button className="btn-danger text-xs" disabled={!mergeTo} onClick={() => merge.mutate()}>{t('ranks.merge')}</button>
          </>
        ) : (
          <button className="btn-danger text-xs" onClick={() => remove.mutate()}>{t('common.delete')}</button>
        )}
      </div>
    </div>
  );
}

export default function Ranks() {
  const { t } = useI18n();
  const { data } = useRanks();
  const qc = useQueryClient();
  const [items, setItems] = useState<Rank[]>([]);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#22c55e');
  const [newStripe, setNewStripe] = useState(false);
  const [newStripeColor, setNewStripeColor] = useState('#111827');
  const [newStripeCount, setNewStripeCount] = useState(1);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => setItems(data ?? []), [data]);

  const reorder = useMutation({
    mutationFn: (orderedIds: number[]) => api.post('/api/ranks/reorder', { orderedIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ranks'] }),
  });
  const add = useMutation({
    mutationFn: () =>
      api.post('/api/ranks', {
        name: newName,
        beltColor: newColor,
        stripeColor: newStripe ? newStripeColor : null,
        stripeCount: newStripe ? newStripeCount : 0,
      }),
    onSuccess: () => { setNewName(''); setNewStripe(false); qc.invalidateQueries({ queryKey: ['ranks'] }); },
  });

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((r) => r.id === active.id);
    const newIndex = items.findIndex((r) => r.id === over.id);
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    reorder.mutate(next.map((r) => r.id));
  };

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">{t('ranks.title')}</h1>
      <p className="text-sm text-slate-500">{t('ranks.reorderHint')}</p>

      <div className="card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <BeltSwatch color={newColor} stripeColor={newStripe ? newStripeColor : null} stripeCount={newStripeCount} width={44} height={16} />
          <input type="color" title="Belt colour" className="h-10 w-10 rounded border" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
          <input className="input flex-1" placeholder={t('common.name')} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <label className="flex items-center gap-1 text-xs text-slate-500">
            <input type="checkbox" checked={newStripe} onChange={(e) => setNewStripe(e.target.checked)} /> stripe
          </label>
          {newStripe && (
            <>
              <input type="color" title="Stripe colour" className="h-10 w-10 rounded border" value={newStripeColor} onChange={(e) => setNewStripeColor(e.target.value)} />
              <input type="number" min={1} max={10} className="input w-14" value={newStripeCount} onChange={(e) => setNewStripeCount(Number(e.target.value))} />
            </>
          )}
          <button className="btn-primary shrink-0" disabled={!newName} onClick={() => add.mutate()}>{t('ranks.add')}</button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((r) => (
              <Row key={r.id} rank={r} ranks={items} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
