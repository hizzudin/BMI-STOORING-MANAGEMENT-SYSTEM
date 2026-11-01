'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { WorkOrderCategory, WorkOrderPriority } from '@bmi/shared';
import { priorityPill } from '@/lib/status';
import { Pill } from '@/components/Pill';
import { createWorkOrderAction, type CreateWoState } from '../actions';

interface Labels {
  readonly vehicle: string;
  readonly category: string;
  readonly priority: string;
  readonly description: string;
  readonly findingNote: string;
  readonly findingNoteHelp: string;
  readonly requiresDowntime: string;
  readonly submit: string;
  readonly cancel: string;
  readonly generic: string;
  readonly titleField: string;
}

function SubmitButton({ label }: { label: string }): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {label}
    </button>
  );
}

/**
 * Create-WO composer form (REQ-WO-001/016).
 *
 * REQ-WO-016 behaviour, proven by the state model below: the originator's
 * `finding_note` is rendered in a READ-ONLY textarea and carried to the server
 * as a HIDDEN field — it is never bound to the `description` state, so editing
 * the description cannot change it. The description is a separate controlled
 * input the Planner edits freely.
 */
export function CreateWorkOrderForm({
  vehicles,
  findingNote,
  seedDescription,
  seedVehicleId,
  labels,
}: {
  vehicles: ReadonlyArray<{ id: number; plate: string }>;
  findingNote: string | null;
  seedDescription: string;
  seedVehicleId: number | null;
  labels: Labels;
}): JSX.Element {
  const [description, setDescription] = useState(seedDescription);
  const [priority, setPriority] = useState<string>(WorkOrderPriority.Normal);
  const [state, formAction] = useFormState<CreateWoState, FormData>(createWorkOrderAction, {});

  return (
    <form action={formAction} className="layout-split">
      <div>
        {state.error ? (
          <p className="form-error" role="alert">
            {state.error === 'error.generic' ? labels.generic : state.error}
          </p>
        ) : null}

        <div className="field-group">
          <label className="field-label" htmlFor="vehicleId">
            {labels.vehicle}
          </label>
          <select
            id="vehicleId"
            name="vehicleId"
            className="select"
            defaultValue={seedVehicleId ?? ''}
            required
          >
            <option value="" disabled>
              —
            </option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="title">
            {labels.titleField}
          </label>
          <input
            id="title"
            name="title"
            type="text"
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="description">
            {labels.description}
          </label>
          <textarea
            id="description"
            name="description"
            className="textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>

        <div className="field-group" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
          <input id="requiresDowntime" name="requiresDowntime" type="checkbox" />
          <label className="field-label" htmlFor="requiresDowntime" style={{ marginBottom: 0 }}>
            {labels.requiresDowntime}
          </label>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
          <SubmitButton label={labels.submit} />
          <a href="/work-orders" className="btn btn-secondary">
            {labels.cancel}
          </a>
        </div>
      </div>

      <div>
        <div className="field-group">
          <label className="field-label" htmlFor="category">
            {labels.category}
          </label>
          <select id="category" name="category" className="select" defaultValue={WorkOrderCategory.Corrective}>
            {Object.values(WorkOrderCategory).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="priority">
            {labels.priority}
          </label>
          <select
            id="priority"
            name="priority"
            className="select"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            {Object.values(WorkOrderPriority).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <span style={{ display: 'inline-block', marginTop: 'var(--space-xs)' }}>
            <Pill spec={priorityPill(priority as WorkOrderPriority)} srPrefix={labels.priority} />
          </span>
        </div>

        {/*
          REQ-WO-016: finding note shown READ-ONLY and carried as a hidden field.
          It is NOT part of the `description` state, so editing the description
          above can never alter it.
        */}
        {findingNote ? (
          <div className="field-group">
            <label className="field-label" htmlFor="findingNoteDisplay">
              {labels.findingNote}
            </label>
            <textarea
              id="findingNoteDisplay"
              className="textarea"
              value={findingNote}
              readOnly
              aria-readonly="true"
            />
            <input type="hidden" name="findingNote" value={findingNote} />
            <span className="field-help">{labels.findingNoteHelp}</span>
          </div>
        ) : null}
      </div>
    </form>
  );
}
