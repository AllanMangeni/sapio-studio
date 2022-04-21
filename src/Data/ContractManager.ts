import * as Bitcoin from 'bitcoinjs-lib';
import { Output } from 'bitcoinjs-lib/types/transaction';
import * as assert from 'assert';
import _, { Collection } from 'lodash';
import {
    InputMapT,
    InputMap,
    TXID,
    TXIDAndWTXIDMapT,
    txid_buf_to_string,
    TXIDAndWTXIDMap,
} from '../util';
import { PhantomTransactionModel, TransactionModel } from './Transaction';
import { UTXOModel } from './UTXO';
import Color from 'color';
import {
    Continuation,
    ContinuationTable,
    Data,
    ObjectMetadata,
    UTXOFormatData,
} from '../common/preload_interface';
export type NodeColorT = ['NodeColor', string];
export const NodeColor = {
    new(c: string): NodeColorT {
        return ['NodeColor', c];
    },
    get(c: NodeColorT): string {
        return c[1];
    },
    clone(c: NodeColorT) {
        return NodeColor.new(c[1].slice());
    },
};

type PreProcessedData = {
    psbts: Array<Bitcoin.Psbt>;
    txns: Array<Bitcoin.Transaction>;
    txn_colors: Array<NodeColorT>;
    txn_labels: Array<string>;
    utxo_labels: Array<Array<UTXOFormatData | null>>;
    continuations: ContinuationTable;
    object_metadata: Record<string, ObjectMetadata>;
};
type ProcessedData = {
    inputs_map: InputMapT<TransactionModel>;
    txid_map: TXIDAndWTXIDMapT<TransactionModel>;
    txn_models: Array<TransactionModel>;
    utxo_models: Array<UTXOModel>;
    continuations: ContinuationTable;
    object_metadata: Record<string, ObjectMetadata>;
};

function preprocess_data(data: Data): PreProcessedData {
    const psbts = [];
    const txns = [];
    const txn_labels = [];
    const txn_colors = [];
    const utxo_labels = [];
    const continuations: Record<string, Record<string, Continuation>> = {};
    const object_metadata: Record<string, ObjectMetadata> = {};

    for (const [path, entry] of Object.entries(data.program)) {
        const k = entry.out;
        continuations[k] = entry.continue_apis;
        object_metadata[k] = entry.metadata;
        let txid = null;
        let idx = 0;
        for (const [j, tx] of entry.txs.entries()) {
            psbts.push(Bitcoin.Psbt.fromBase64(tx.linked_psbt.psbt));
            const txn = Bitcoin.Transaction.fromHex(tx.linked_psbt.hex);
            if (txid === null) {
                txid = txid_buf_to_string(txn.ins[0]!.hash);
                idx = txn.ins[0]!.index;
            } else {
                const c_txid = txid_buf_to_string(txn.ins[0]!.hash);
                const c_idx = txn.ins[0]!.index;
                if (c_txid !== txid || c_idx !== idx) {
                    throw 'Sapio Invariant Error: All txs in a group should spend the same coin';
                }
            }

            txns.push(txn);
            txn_labels.push(tx.linked_psbt.metadata.label ?? 'unlabeled');
            txn_colors.push(
                NodeColor.new(tx.linked_psbt.metadata.color ?? 'orange')
            );
            utxo_labels.push(
                tx.linked_psbt.output_metadata ?? new Array(txn.outs.length)
            );
        }
    }

    return {
        psbts,
        txns,
        txn_colors,
        txn_labels,
        utxo_labels,
        continuations,
        object_metadata,
    };
}

function process_inputs_map(
    txns: Array<TransactionModel>
): InputMapT<TransactionModel> {
    const inputs_map: InputMapT<TransactionModel> = InputMap.new();
    for (const txn_m of txns) {
        const txn: Bitcoin.Transaction = txn_m.tx;
        for (const inp of txn.ins) {
            InputMap.add(inputs_map, inp, txn_m);
        }
    }
    return inputs_map;
}

export type SigningDataStore = {
    witnesses: Buffer[][][];
    psbts: Bitcoin.Psbt[];
};
function process_txn_models(
    psbts: Array<Bitcoin.Psbt>,
    txns: Array<Bitcoin.Transaction>,
    txn_labels: Array<string>,
    txn_colors: Array<NodeColorT>,
    utxo_labels: Array<Array<UTXOFormatData | null>>
): [TXIDAndWTXIDMapT<TransactionModel>, Array<TransactionModel>] {
    const txid_map: TXIDAndWTXIDMapT<TransactionModel> = TXIDAndWTXIDMap.new();
    const txn_models: Array<TransactionModel> = [];
    assert.equal(txns.length, psbts.length);
    assert.equal(txns.length, txn_labels.length);
    assert.equal(txns.length, txn_colors.length);
    assert.equal(txns.length, utxo_labels.length);
    _.chain(_.zip(txns, psbts, txn_labels, txn_colors, utxo_labels))
        .map(([tx, psbt, txn_label, txn_color, utxo_labels], index) => {
            return {
                tx: tx!,
                psbt: psbt!,
                txn_label: txn_label!,
                txn_color: txn_color!,
                utxo_labels: utxo_labels!,
            };
        })
        .groupBy(({ tx }: { tx: Bitcoin.Transaction }) => tx.getId())
        .forEach(
            (
                txn_group: {
                    tx: Bitcoin.Transaction;
                    psbt: Bitcoin.Psbt;
                    txn_label: string;
                    txn_color: NodeColorT;
                    utxo_labels: (UTXOFormatData | null)[];
                }[]
            ) => {
                let label = '';
                let color = NodeColor.new('');
                let utxo_label: Array<UTXOFormatData | null> = [];
                const all_witnesses: SigningDataStore = {
                    witnesses: [],
                    psbts: [],
                };
                for (const {
                    tx,
                    psbt,
                    txn_label,
                    txn_color,
                    utxo_labels,
                } of txn_group) {
                    utxo_label = utxo_labels;
                    color = txn_color;
                    label = txn_label;
                    const witnesses: Buffer[][] = [];
                    for (const input of tx.ins) {
                        witnesses.push(input.witness);
                    }

                    all_witnesses.witnesses.push(witnesses);
                    all_witnesses.psbts.push(psbt);
                }
                assert.ok(txn_group.length > 0); // because group call must be true
                const base_txn: Bitcoin.Transaction = txn_group[0]!.tx.clone();
                // Clear out witness Data
                for (const input of base_txn.ins) {
                    input.witness = [];
                }
                const txn_model = new TransactionModel(
                    base_txn,
                    all_witnesses,
                    label,
                    color,
                    utxo_label
                );
                TXIDAndWTXIDMap.add(txid_map, txn_model);
                txn_models.push(txn_model);
            }
        )
        .value();
    const to_create: Map<TXID, Array<Bitcoin.TxInput>> = new Map();
    for (const txn_model of txn_models) {
        for (const input of txn_model.tx.ins) {
            const txid = txid_buf_to_string(input.hash);
            if (TXIDAndWTXIDMap.has_by_txid(txid_map, txid)) {
                continue;
            }
            // Doesn't matter if already exists in array!
            // De Duplicated later...
            const inps = to_create.get(txid) || [];
            inps.push(input);
            to_create.set(txid, inps);
        }
    }
    to_create.forEach((inps, txid) => {
        const mock_txn = new Bitcoin.Transaction();
        const n_outputs: number =
            1 +
            _.chain(inps)
                .map((el) => el.index)
                .max()
                .value();
        for (let i = 0; i < n_outputs; ++i) {
            // Set to MAX sats...
            // TODO: a hack to make the flow technically correct and detectable
            mock_txn.addOutput(Buffer.from(''), 21e6 * 100e6);
        }
        const c = Color(
            [Math.random() * 255, Math.random() * 255, Math.random() * 255],
            'rgb'
        ).toString();
        const color = NodeColor.new(c);
        const utxo_metadata: Array<UTXOFormatData | null> = new Array(
            n_outputs
        );
        utxo_metadata.fill(null);
        const txn_model = new PhantomTransactionModel(
            txid,
            mock_txn,
            { witnesses: [], psbts: [] },
            'Unknown Inputs',
            color,
            utxo_metadata
        );
        TXIDAndWTXIDMap.add(txid_map, txn_model);
        txn_models.push(txn_model);
    });

    return [txid_map, txn_models];
}
function process_utxo_models(
    txn_models: Array<TransactionModel>,
    inputs_map: InputMapT<TransactionModel>
): Array<UTXOModel> {
    const to_add: Array<UTXOModel> = [];
    for (const m_txn of txn_models) {
        assert.equal(m_txn.utxo_models.length, m_txn.tx.outs.length);
        if (!(m_txn instanceof PhantomTransactionModel))
            to_add.push(...m_txn.utxo_models);
        _.zip(m_txn.utxo_models, m_txn.tx.outs).forEach(
            ([opt_utxo_model, opt_out], output_index) => {
                // safe because of assert
                const utxo_model = opt_utxo_model!;
                const out = opt_out!;
                const spenders: Array<TransactionModel> =
                    InputMap.get_txid_s(
                        inputs_map,
                        m_txn.get_txid(),
                        output_index
                    ) ?? [];
                assert.equal(m_txn, utxo_model.getOptions().txn);
                if (
                    m_txn instanceof PhantomTransactionModel &&
                    spenders.length > 0
                ) {
                    to_add.push(utxo_model);
                    if (spenders[0]?.witness_set.witnesses.length) {
                        const witstack =
                            spenders[0]?.witness_set.witnesses[0]?.[
                                utxo_model.getOptions().utxo.index
                            ];
                        if (witstack) {
                            const program = witstack[witstack.length - 1];
                            if (program) {
                                Bitcoin.crypto.sha256(program);
                                const script = Buffer.alloc(34);
                                script[0] = 0x0;
                                script[1] = 0x20;
                                program.copy(script, 2);
                                // TODO: Single Input assumption!
                                out.script = script;
                                const max_amount = spenders.reduce(
                                    (m, s) =>
                                        Math.max(
                                            s.tx.outs.reduce(
                                                (a, v) =>
                                                    a + (v as Output).value ??
                                                    0,
                                                0
                                            ),
                                            m
                                        ),
                                    0
                                );
                                (
                                    utxo_model.getOptions().txn.tx.outs[
                                        utxo_model.getOptions().utxo.index
                                    ] as Output
                                ).value = max_amount;
                                utxo_model.getOptions().utxo.amount =
                                    max_amount;
                                const _address =
                                    Bitcoin.address.fromOutputScript(
                                        script,
                                        Bitcoin.networks.regtest
                                    );
                            }
                        }
                    }
                }
                spenders.forEach((spender, spend_idx) => {
                    const spender_tx: Bitcoin.Transaction = spender.tx;
                    const idx = spender_tx.ins.findIndex(
                        (elt) =>
                            elt.index === output_index &&
                            txid_buf_to_string(elt.hash) === m_txn.get_txid()
                    );
                    if (idx === -1) {
                        throw new Error('Missing Spender Error');
                    }
                    const link = utxo_model.spent_by(spender, spend_idx, idx);
                    spender.input_links.push(link);
                    utxo_model.getOptions().utxo.spends.push(spender);
                });
            }
        );
    }
    return to_add;
}
function process_data(obj: PreProcessedData): ProcessedData {
    const {
        psbts,
        txns,
        txn_colors,
        txn_labels,
        utxo_labels,
        continuations,
        object_metadata,
    } = obj;
    const [txid_map, txn_models] = process_txn_models(
        psbts,
        txns,
        txn_labels,
        txn_colors,
        utxo_labels
    );
    const inputs_map = process_inputs_map(txn_models);

    const to_add = process_utxo_models(txn_models, inputs_map);
    return {
        inputs_map: inputs_map,
        utxo_models: to_add,
        txn_models: txn_models,
        txid_map: txid_map,
        continuations,
        object_metadata,
    };
}

type TimingData = {
    unlock_time: number;
    unlock_height: number;
    unlock_at_relative_height: number;
    unlock_at_relative_time: number;
    txn: TransactionModel;
};
class TimingCache {
    // Array should be de-duplicated!
    cache: Map<TXID, [TimingData, Array<TransactionModel> | null]>;
    constructor() {
        this.cache = new Map();
    }
}
export const timing_cache = new TimingCache();

// In theory this just returns the PhantomTransactions, but in order to make it
// work with future changes compute rather than infer this list
function get_base_transactions(
    txns: Array<TransactionModel>,
    map: TXIDAndWTXIDMapT<TransactionModel>
): Array<TransactionModel> {
    const phantoms = txns.filter((item) => {
        return (
            -1 ===
            item.tx.ins.findIndex((inp) =>
                TXIDAndWTXIDMap.has_by_txid(map, txid_buf_to_string(inp.hash))
            )
        );
    });
    return phantoms;
}
// Based off of
// https://stackoverflow.com/a/41170834
function mergeAndDeduplicateSorted<T, T2>(
    array1: T[],
    array2: T[],
    iteratee: (t: T) => T2
): Array<T> {
    const mergedArray: Array<T> = [];
    let i = 0;
    let j = 0;
    while (i < array1.length && j < array2.length) {
        if (iteratee(array1[i]!) < iteratee(array2[j]!)) {
            mergedArray.push(array1[i]!);
            i++;
        } else if (iteratee(array1[i]!) > iteratee(array2[j]!)) {
            mergedArray.push(array2[j]!);
            j++;
        } else {
            // Arbitrary
            mergedArray.push(array1[i]!);
            i++;
            j++;
        }
    }
    if (i < array1.length) {
        for (let p = i; p < array1.length; p++) {
            mergedArray.push(array1[p]!);
        }
    } else {
        for (let p = j; p < array2.length; p++) {
            mergedArray.push(array2[p]!);
        }
    }
    return mergedArray;
}
function unreachable_by_time(
    bases: Array<TransactionModel>,
    max_time: number,
    max_height: number,
    start_height: number,
    start_time: number,
    map: InputMapT<TransactionModel>
): Array<TransactionModel> {
    // Every Array is Sorted and Unique, but *may* overlap
    const arrays = bases.map((b) =>
        unreachable_by_time_inner(
            b,
            max_time,
            max_height,
            start_height,
            start_time,
            map
        )
    );
    // This algorithm is either O(# TransactionModels^2) because models can share descendants.
    // The alternative would be to call flat (O(n^2)) and then call sort...
    // The algorithm cannot be in place on the *first pass* because the arrays are from our cache
    // and shouldn't be modified.
    // Later passes could one day re-use allocations...
    while (arrays.length > 1) {
        // Picks two random arrays to merge at a time to prevent adversarial cases...
        const v1 = Math.floor(Math.random() * arrays.length);
        let v2 = Math.floor(Math.random() * arrays.length);
        // Rejection sample for v2...
        while (v1 === v2) {
            v2 = Math.floor(Math.random() * arrays.length);
        }
        arrays[v1] = _(
            mergeAndDeduplicateSorted(
                arrays[v1]!,
                arrays[v2]!,
                (t: TransactionModel) => t.get_txid()
            )
        )
            .sortedUniqBy((t: TransactionModel) => t.get_txid())
            .value();
        const last = arrays.pop();
        if (last === undefined) throw Error('Invariant Broken on Array Length');
        if (arrays.length !== v2) {
            arrays[v2] = last;
        }
    }
    return arrays[0] ?? [];
}
function compute_timing(txn: TransactionModel): TimingData {
    let cache_entry = timing_cache.cache.get(txn.get_txid());
    if (cache_entry) {
        return cache_entry[0];
    }
    const locktime = txn.tx.locktime;
    const sequences = txn.tx.ins.map((inp) => inp.sequence);
    // TODO: Handle MTP?
    let unlock_at_relative_height = 0;
    let unlock_at_relative_time = 0;
    let locktime_enabled = false;
    sequences.forEach((s) => {
        // Only enable locktime if at least one input is not UINT_MAX
        if (s === 0xffffffff) return;
        locktime_enabled = true;
        // skip, no meaning if set (except perhaps to enable locktime)
        if (s & (1 << 31)) return;
        // Only bottom of sequence applies
        const s_mask = 0x00ffff & s;
        if (s & (1 << 22)) {
            // Interpret as a relative time, units 512 seconds per s_mask
            unlock_at_relative_time = Math.max(
                s_mask * 512,
                unlock_at_relative_time
            );
        } else {
            // Interpret as a relative height, units blocks
            unlock_at_relative_height = Math.max(
                s_mask,
                unlock_at_relative_height
            );
        }
    });
    // before 500M, it is a height. After a UNIX time.
    const is_height = locktime < 500_000_000;
    const unlock_time = locktime_enabled && !is_height ? locktime : 0;
    const unlock_height = locktime_enabled && is_height ? locktime : 0;
    cache_entry = [
        {
            unlock_time,
            unlock_height,
            unlock_at_relative_height,
            unlock_at_relative_time,
            txn,
        },
        null,
    ];
    timing_cache.cache.set(txn.get_txid(), cache_entry);
    return cache_entry[0];
}
function compute_timing_of_children(
    txn: TransactionModel,
    map: InputMapT<TransactionModel>
): Collection<TimingData> {
    const spenders: Record<number, TransactionModel[]> =
        InputMap.get_txid_s_group(map, txn.get_txid()) ?? {};
    return _(Array.from(Object.values(spenders))).flatMap(
        (output_spender: TransactionModel[]) =>
            output_spender.map(compute_timing)
    );
}

function unreachable_by_time_inner(
    base: TransactionModel,
    max_time: number,
    max_height: number,
    elapsed_time: number,
    elapsed_blocks: number,
    map: InputMapT<TransactionModel>
): Array<TransactionModel> {
    return compute_timing_of_children(base, map)
        .value()
        .flatMap(
            ({
                unlock_time,
                unlock_height,
                unlock_at_relative_height,
                unlock_at_relative_time,
                txn,
            }) => {
                // The soonest time to satisfy both conditions
                const time_when_spendable = Math.max(
                    unlock_time,
                    elapsed_time + unlock_at_relative_time
                );
                const height_when_spendable = Math.max(
                    unlock_height,
                    elapsed_blocks + unlock_at_relative_height
                );
                // Return All Descendants and us from here because none of these transactions can go through
                // It is > because a block will accept ==
                if (
                    time_when_spendable > max_time ||
                    height_when_spendable > max_height
                ) {
                    // TODO: Make this a Set type?
                    return all_descendants(txn, map);
                }
                // Recurse with the new times
                return unreachable_by_time_inner(
                    txn,
                    max_time,
                    max_height,
                    time_when_spendable,
                    height_when_spendable,
                    map
                );
            }
        );
}
function all_descendants(
    t: TransactionModel,
    inputs_map: InputMapT<TransactionModel>
): Array<TransactionModel> {
    let cache_entry = timing_cache.cache.get(t.get_txid());
    if (cache_entry && cache_entry[1]) return cache_entry[1];
    // This case probably never happens...
    if (!cache_entry) {
        cache_entry = [compute_timing(t), null];
        timing_cache.cache.set(t.get_txid(), cache_entry);
    }
    cache_entry[1] = _(
        Array.from(
            Object.values(
                InputMap.get_txid_s_group(inputs_map, t.get_txid()) ?? {}
            ) ?? []
        )
            .flat(1)
            .map((x) => all_descendants(x, inputs_map))
            .flat(1)
    )
        .uniqBy((t) => t.get_txid())
        .sortBy((t) => t.get_txid())
        .value()
        .concat(t);
    return cache_entry[1];
}

export class ContractBase {
    utxo_models: Array<UTXOModel>;
    txn_models: Array<TransactionModel>;
    inputs_map: InputMapT<TransactionModel>;
    txid_map: TXIDAndWTXIDMapT<TransactionModel>;
    continuations: ContinuationTable;
    object_metadata: Record<string, ObjectMetadata>;
    constructor() {
        this.utxo_models = [];
        this.inputs_map = InputMap.new();
        this.txn_models = [];
        this.txid_map = TXIDAndWTXIDMap.new();
        this.continuations = {};
        this.object_metadata = {};
    }

    lookup_utxo_model(txid: Buffer, n: number): UTXOModel | null {
        console.log('called empty');
        throw 'Called Empty';
    }
    should_update() {
        return false;
    }
    get_continuations(): typeof ContractBase.prototype.continuations {
        return this.continuations;
    }
}

export class ContractModel extends ContractBase {
    checkable = false;
    constructor();
    constructor(obj: Data);
    constructor(obj?: Data) {
        super();
        this.checkable = true;
        if (obj === undefined) return;
        const new_obj = preprocess_data(obj);
        const {
            inputs_map,
            utxo_models,
            txn_models,
            txid_map,
            continuations,
            object_metadata,
        } = process_data(new_obj);
        this.utxo_models = utxo_models;
        this.inputs_map = inputs_map;
        this.txn_models = txn_models;
        this.txid_map = txid_map;
        this.continuations = continuations;
        this.object_metadata = object_metadata;
    }
    should_update() {
        return this.checkable;
    }
    // TODO: Return an Array of UTXOModels
    lookup_utxo_model(txid: Buffer, n: number): UTXOModel | null {
        const txid_s = txid_buf_to_string(txid);
        return (
            TXIDAndWTXIDMap.get_by_txid_s(this.txid_map, txid_s)?.utxo_models[
                n
            ] ?? null
        );
    }
    reachable_at_time(
        max_time: number,
        max_height: number,
        start_time: number,
        start_height: number
    ): Array<TransactionModel> {
        const bases = get_base_transactions(this.txn_models, this.txid_map);
        return unreachable_by_time(
            bases,
            max_time,
            max_height,
            start_time,
            start_height,
            this.inputs_map
        );
    }
}
