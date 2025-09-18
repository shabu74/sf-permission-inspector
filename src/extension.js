const vscode = require('vscode');
const PermissionManagerPanel = require('./permissionManagerPanel');

function activate(context) {
    const disposable = vscode.commands.registerCommand('salesforce-permission-inspector.openInspector', () => {
        PermissionManagerPanel.createOrShow(context.extensionUri);
    });

    context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};