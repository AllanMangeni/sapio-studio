import { IconButton, Tooltip } from '@mui/material';
import { green } from '@mui/material/colors';
import DoubleArrowIcon from '@mui/icons-material/DoubleArrow';
import React from 'react';
import { useDispatch } from 'react-redux';
import { select_txn, select_utxo } from '../EntitySlice';
import Hex from './Hex';
import './OutpointDetail.css';
export function OutpointDetail(props: { txid: string; n: number }) {
    const dispatch = useDispatch();
    return (
        <div className="OutpointDetail">
            <Hex
                className="txhex"
                label="Outpoint"
                value={props.txid.toString() + ':' + props.n}
            />
            <Tooltip title="Go To the Transaction that created this.">
                <IconButton
                    aria-label="goto-creating-txn"
                    onClick={() => dispatch(select_txn(props.txid))}
                >
                    <DoubleArrowIcon style={{ color: green[500] }} />
                </IconButton>
            </Tooltip>
        </div>
    );
}

export function RefOutpointDetail(props: { txid: string; n: number }) {
    const dispatch = useDispatch();
    return (
        <div className="OutpointDetail">
            <Hex
                className="txhex"
                label="Outpoint"
                value={props.txid.toString() + ':' + props.n}
            />
            <Tooltip title="Go to this outpoint">
                <IconButton
                    aria-label="goto-this-outpoint"
                    onClick={() =>
                        dispatch(
                            select_utxo({
                                hash: props.txid,
                                nIn: props.n,
                            })
                        )
                    }
                >
                    <DoubleArrowIcon style={{ color: green[500] }} />
                </IconButton>
            </Tooltip>
        </div>
    );
}

export function TXIDDetail(props: { txid: string }) {
    return <Hex className="txhex" value={props.txid} label="TXID" />;
}
