import { Transaction } from 'bitcoinjs-lib';
import React, { ChangeEvent } from 'react';
import * as Bitcoin from 'bitcoinjs-lib';
import { TransactionModel } from '../../../Data/Transaction';
import { UTXOModel } from '../../../Data/UTXO';
import Hex from './Hex';
import { InputDetail } from './InputDetail';
import { TXIDDetail } from './OutpointDetail';
import { OutputDetail } from './OutputDetail';
import _ from 'lodash';
import './TransactionDetail.css';
import { sequence_convert, time_to_pretty_string } from '../../../util';
import Color from 'color';
import {
    selectTXNColor,
    selectTXNPurpose,
    set_custom_color,
    set_custom_purpose,
} from '../EntitySlice';
import { useDispatch, useSelector } from 'react-redux';
import { Divider, TextField, Typography } from '@mui/material';
import { PSBTDetail } from './PSBTDetail';
interface TransactionDetailProps {
    entity: TransactionModel;
    find_tx_model: (a: Buffer, b: number) => UTXOModel | null;
}
export function TransactionDetail(props: TransactionDetailProps) {
    const dispatch = useDispatch();
    const opts = props.entity.getOptions();
    const txid = opts.txn.getId();
    const color = useSelector(selectTXNColor(txid)) ?? Color(opts.color);
    const purpose = useSelector(selectTXNPurpose(txid)) ?? opts.purpose;

    const outs = props.entity.utxo_models.map((o, i) => (
        <OutputDetail txoutput={o} />
    ));
    const ins = props.entity.tx.ins.map((inp, i) => {
        const witnesses: Buffer[][] =
            props.entity.witness_set.witnesses.flatMap((w) => {
                const b: Buffer[] | undefined = w[i];
                return b ? [b] : [];
            });
        return <InputDetail txinput={inp} witnesses={witnesses} />;
    });

    const {
        greatest_relative_height,
        greatest_relative_time,
        locktime_enable,
        relative_time_jsx,
        relative_height_jsx,
    } = compute_relative_timelocks(props.entity.tx);

    const locktime = props.entity.tx.locktime;
    const as_date = new Date(1970, 0, 1);
    as_date.setSeconds(locktime);
    const lt =
        !locktime_enable || locktime === 0
            ? 'None'
            : locktime < 500_000_000
            ? 'Block #' + locktime.toString()
            : as_date.toUTCString() + ' MTP';
    // note missing horizontal
    const onchange_color = (e: string) => {
        const color = new Color(e);
        dispatch(set_custom_color([txid, color.hex()]));
    };
    const onchange_purpose = (e: string) => {
        dispatch(set_custom_purpose([txid, e]));
    };
    const inner_debounce_color = _.debounce(onchange_color, 30);
    const debounce_color = (e: ChangeEvent<HTMLInputElement>) => {
        inner_debounce_color(e.target.value);
    };
    const inner_debounce_purpose = _.debounce(onchange_purpose, 30);
    const debounce_purpose = (e: ChangeEvent<HTMLInputElement>) => {
        inner_debounce_purpose(e.target.value);
    };
    const absolute_lock_jsx =
        !locktime_enable || locktime === 0 ? null : (
            <>
                <span>Absolute Lock Time:</span>
                <span> {lt} </span>
            </>
        );
    return (
        <div className="TransactionDetail">
            <TextField
                label="Purpose"
                defaultValue={purpose}
                onChange={debounce_purpose}
            />
            <TextField
                label={'Color ' + color.hex()}
                defaultValue={color.hex()}
                fullWidth
                type="color"
                onChange={debounce_color}
            />
            <Divider />
            <TXIDDetail txid={props.entity.get_txid()} />
            <PSBTDetail psbts={props.entity.witness_set.psbts} />
            <Hex
                value={props.entity.tx.toHex()}
                className="txhex"
                label="Tx Hex"
            />
            <div className="properties">
                {absolute_lock_jsx}
                {relative_height_jsx}
                {relative_time_jsx}
            </div>
            <Divider />
            <Typography variant="h5"> Inputs</Typography>
            <div className="inputs">{ins}</div>
            <Divider />
            <Typography variant="h5"> Outputs </Typography>
            <div className="outputs">{outs}</div>
        </div>
    );
}

// TODO: Make this check the input's context
function compute_relative_timelocks(tx: Transaction) {
    const sequences = tx.ins.map((inp) => inp.sequence);
    let greatest_relative_time = 0;
    let greatest_relative_height = 0;
    let locktime_enable = false;
    for (const sequence of sequences) {
        if (sequence === Bitcoin.Transaction.DEFAULT_SEQUENCE) continue;
        locktime_enable = true;
        const { relative_time, relative_height } = sequence_convert(sequence);
        greatest_relative_time = Math.max(
            relative_time,
            greatest_relative_time
        );
        greatest_relative_height = Math.max(
            relative_height,
            greatest_relative_height
        );
    }
    const relative_time_string = time_to_pretty_string(greatest_relative_time);
    const relative_time_jsx =
        greatest_relative_time === 0 ? null : (
            <>
                <span>Relative Lock Time: </span>
                <span>{relative_time_string} </span>
            </>
        );
    const relative_height_jsx =
        greatest_relative_height === 0 ? null : (
            <>
                <span>Relative Height: </span>
                <span>{greatest_relative_height} Blocks</span>
            </>
        );
    return {
        greatest_relative_height,
        greatest_relative_time,
        locktime_enable,
        relative_time_jsx,
        relative_height_jsx,
    };
}
