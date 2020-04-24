import React from 'react';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import { CreateContractModal, ViewContractModal } from "./CreateVaultModal";
export class AppNavbar extends React.Component {
    constructor(props) {
        super(props);
        this.state = {};
        this.state.modal_view = false;
        this.state.modal_create = false;
    }
    render() {
        return (<Navbar>
            <Navbar.Brand> Sapio Explorer </Navbar.Brand>

            <Nav className="justify-content-end w-100">
                <Nav.Link
                    eventKey="create"
                    onSelect={() => this.setState({ modal_create: true })}
                    aria-controls="create-contract-form"
                    aria-expanded={this.state.modal_create}>
                    New
                </Nav.Link>

                <Nav.Link
                    eventKey="view"
                    onSelect={() => this.setState({ modal_view: true })}
                    aria-controls="view-contract-form"
                    aria-expanded={this.state.modal_view}>
                    View
                </Nav.Link>
            </Nav>
            <CreateContractModal
                show={this.state.modal_create}
                hide={() => this.setState({ modal_create: false })}
                load_new_model={this.props.load_new_model}
                compiler={this.props.compiler}
                dynamic_forms={this.props.dynamic_forms} />
            <ViewContractModal
                show={this.state.modal_view}
                hide={() => this.setState({ modal_view: false })}
                bitcoin_node_manager={this.props.bitcoin_node_manager} />


        </Navbar>);
    }
}