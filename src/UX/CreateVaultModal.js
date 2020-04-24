import React from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import FormControl from 'react-bootstrap/FormControl';
import Modal from 'react-bootstrap/Modal';
import Nav from 'react-bootstrap/Nav';
import Tab from 'react-bootstrap/Tab';
import { MenuForm } from '../Compiler/Menu';
export class CreateContractModal extends React.Component {
    constructor(props) {
        super(props);
        this.form = {};
    }
    render() {
        let nav_options = [];
        let tab_options = [];
        let counter = 0;
        let default_key = null;
        for (let option in this.props.dynamic_forms) {
            let key = "dyanimic_form_" + option + counter;
            default_key = default_key || key;
            nav_options.push((
                <Nav.Item key={option}>
                    <Nav.Link eventKey={key} > {option} </Nav.Link>
                </Nav.Item>));
            let args = this.props.dynamic_forms[option];
            tab_options.push((

                <Tab.Pane eventKey={key} key={option} title={option}>
                    <MenuForm hide={this.props.hide} load_new_model={this.props.load_new_model}
                        args={args}
                        type={option}
                        compiler={this.props.compiler} />
                </Tab.Pane>
            ));
            counter++;
        }
        return (<Modal show={this.props.show} onHide={this.props.hide} size="lg">
            <Modal.Header closeButton>
                <Modal.Title> Create a New Contract </Modal.Title>
            </Modal.Header>

            <Tab.Container defaultActiveKey={default_key}>
                <Nav variant="tabs" justify className="navbar">
                    {nav_options}
                </Nav>
                <Tab.Content>
                    {tab_options}
                </Tab.Content>
            </Tab.Container>
            <Modal.Footer>
                <Button variant="secondary" onClick={this.props.hide}> Close </Button>
            </Modal.Footer>
        </Modal>);
    }
}
export class ViewContractModal extends React.Component {
    constructor(props) {
        super(props);
        this.form = {};
    }
    render() {
        return (<Modal show={this.props.show} onHide={this.props.hide}>
            <Modal.Header closeButton>
                <Modal.Title> View Existing Contract </Modal.Title>
            </Modal.Header>
            <Form>
                <FormControl as="select" placeholder="Existing Contract" className=" mr-sm-2" />
                <Button type="submit">View</Button>
            </Form>
            <Modal.Footer>
                <Button variant="secondary" onClick={() => this.setState({ modal_view: false })}> Close </Button>
            </Modal.Footer>
        </Modal>);
    }
}