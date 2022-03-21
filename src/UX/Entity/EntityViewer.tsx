import { IconButton, Tooltip, useTheme } from '@mui/material';
import { red } from '@mui/material/colors';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ContractModel } from '../../Data/ContractManager';
import { TransactionModel } from '../../Data/Transaction';
import { UTXOModel } from '../../Data/UTXO';
import { TXIDAndWTXIDMap } from '../../util';
import { TransactionDetail } from './Detail/TransactionDetail';
import { UTXODetail } from './Detail/UTXODetail';
import {
    deselect_entity,
    EntityType,
    selectEntityToView,
    selectShouldViewEntity,
} from './EntitySlice';
import './EntityViewer.css';
import Color from 'color';

interface CurrentylViewedEntityProps {
    current_contract: ContractModel;
}

export function CurrentlyViewedEntity(props: CurrentylViewedEntityProps) {
    const theme = useTheme();
    const [width, setWidth] = React.useState('20em');
    const onMouseUp = (e: MouseEvent) => {
        e.preventDefault();
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };
    const onMouseMove = (e: MouseEvent) => {
        e.preventDefault();
        const width = (window.innerWidth - e.clientX).toString() + 'px';
        setWidth(width);
    };
    const onMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
        e.preventDefault();
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const show = useSelector(selectShouldViewEntity);
    const entity_id: EntityType = useSelector(selectEntityToView);
    let guts: JSX.Element | null = null;
    if (show) {
        switch (entity_id[0]) {
            case 'TXN': {
                const entity =
                    TXIDAndWTXIDMap.get_by_txid_s(
                        props.current_contract.txid_map,
                        entity_id[1]
                    ) ?? null;
                if (entity) {
                    guts = (
                        <TransactionDetail
                            entity={entity as TransactionModel}
                            find_tx_model={(a: Buffer, b: number) =>
                                props.current_contract.lookup_utxo_model(a, b)
                            }
                        />
                    );
                }
                break;
            }
            case 'UTXO': {
                const entity =
                    TXIDAndWTXIDMap.get_by_txid_s(
                        props.current_contract.txid_map,
                        entity_id[1].hash
                    )?.utxo_models[entity_id[1].nIn] ?? null;
                if (entity) {
                    guts = (
                        <UTXODetail
                            entity={entity as UTXOModel}
                            contract={props.current_contract}
                        />
                    );
                }
                break;
            }
            case 'NULL':
                break;
        }
    }
    const dispatch = useDispatch();
    return (
        <div
            className="EntityViewerFrame"
            style={{
                backgroundColor: Color(theme.palette.background.default)
                    .fade(0.2)
                    .toString(),
            }}
        >
            <div className="EntityViewerResize" onMouseDown={onMouseDown}></div>
            <div>
                <Tooltip title="Close Entity Viewer">
                    <IconButton
                        aria-label="close-entity-viewer"
                        onClick={() => dispatch(deselect_entity())}
                    >
                        <CancelOutlinedIcon style={{ color: red[500] }} />
                    </IconButton>
                </Tooltip>
                <div
                    className="EntityViewer"
                    style={{
                        width: width,
                    }}
                >
                    {guts}
                </div>
            </div>
        </div>
    );
}
