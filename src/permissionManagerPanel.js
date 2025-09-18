const vscode = require('vscode');
const SalesforceService = require('./salesforceService');

class PermissionManagerPanel {
    static currentPanel;
    static viewType = 'permissionManager';

    constructor(panel, extensionUri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._disposables = [];
        this.salesforceService = new SalesforceService();

        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'fetchUserPermissions':
                        await this.handleFetchUserPermissions(message.email);
                        break;
                    case 'fetchFieldPermissions':
                        await this.handleFetchFieldPermissions(message.objectName, message.userId);
                        break;
                    case 'fetchSharingDetails':
                        await this.handleFetchSharingDetails(message.objectName, message.userId);
                        break;
                    case 'loadUsers':
                        await this.handleLoadUsers();
                        break;
                    case 'searchUsers':
                        this.handleSearchUsers(message.searchTerm, message.users);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    static createOrShow(extensionUri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (PermissionManagerPanel.currentPanel) {
            PermissionManagerPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            PermissionManagerPanel.viewType,
            'Salesforce Permission Inspector',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        PermissionManagerPanel.currentPanel = new PermissionManagerPanel(panel, extensionUri);
    }

    async handleFetchUserPermissions(email) {
        try {
            this._panel.webview.postMessage({ command: 'showLoading' });
            const permissions = await this.salesforceService.getUserObjectPermissions(email);
            this._panel.webview.postMessage({ 
                command: 'displayObjectPermissions', 
                data: permissions 
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error fetching permissions: ${error.message}`);
            this._panel.webview.postMessage({ command: 'hideLoading' });
        }
    }

    async handleFetchFieldPermissions(objectName, userId) {
        try {
            const fieldPermissions = await this.salesforceService.getFieldPermissions(objectName, userId);
            this._panel.webview.postMessage({ 
                command: 'displayFieldPermissions', 
                data: fieldPermissions,
                objectName: objectName
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error fetching field permissions: ${error.message}`);
        }
    }

    async handleFetchSharingDetails(objectName, userId) {
        try {
            const sharingDetails = await this.salesforceService.getObjectSharingAccess(objectName, userId);
            this._panel.webview.postMessage({ 
                command: 'displaySharingDetails', 
                data: sharingDetails,
                objectName: objectName
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error fetching sharing details: ${error.message}`);
        }
    }

    async handleLoadUsers() {
        try {
            const users = await this.salesforceService.getAllActiveStandardUsers();
            this._panel.webview.postMessage({ 
                command: 'usersLoaded', 
                data: users
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error loading users: ${error.message}`);
        }
    }

    handleSearchUsers(searchTerm, users) {
        try {
            const filteredUsers = this.salesforceService.searchUsers(users, searchTerm);
            this._panel.webview.postMessage({ 
                command: 'displayUserSearchResults', 
                data: filteredUsers
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error searching users: ${error.message}`);
        }
    }

    dispose() {
        PermissionManagerPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    _getHtmlForWebview() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Salesforce Permission Inspector</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 20px;
        }
        
        .header {
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .input-section {
            margin-bottom: 20px;
        }
        
        .input-group {
            display: flex;
            gap: 10px;
            align-items: center;
        }
        
        .user-search {
            position: relative;
            min-width: 300px;
        }
        
        .user-search input {
            padding: 8px 12px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 3px;
            width: 100%;
        }
        
        .user-dropdown {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background-color: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-input-border);
            border-top: none;
            max-height: 200px;
            overflow-y: auto;
            z-index: 1000;
            display: none;
        }
        
        .user-option {
            padding: 8px 12px;
            cursor: pointer;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .user-option:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .user-option:last-child {
            border-bottom: none;
        }
        
        .user-name {
            font-weight: 500;
        }
        
        .user-email {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
        }
        
        button {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .loading {
            display: none;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
        
        .table-container {
            margin-top: 20px;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
        }
        
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        th {
            background-color: var(--vscode-list-hoverBackground);
            font-weight: 600;
            position: sticky;
            top: 0;
        }
        
        tr:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .expandable-row {
            cursor: pointer;
        }
        
        .expandable-row:hover {
            background-color: var(--vscode-list-activeSelectionBackground);
        }
        
        .access-level {
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 0.85em;
            font-weight: 500;
        }
        
        .access-full { background-color: #28a745; color: white; }
        .access-edit { background-color: #28a745; color: white; }
        .access-read { background-color: #ffc107; color: black; }
        .access-none { background-color: #dc3545; color: white; }
        
        .reason {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
        }
        
        .field-permissions {
            margin-top: 10px;
            margin-left: 20px;
            display: none;
        }
        
        .field-permissions.show {
            display: block;
        }
        
        .field-table {
            border: 1px solid var(--vscode-panel-border);
            margin-top: 10px;
        }
        
        .expand-icon {
            margin-right: 8px;
            transition: transform 0.2s;
        }
        
        .expand-icon.expanded {
            transform: rotate(90deg);
        }
        
        .no-data {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            padding: 40px;
        }
        
        .auth-info {
            margin-top: 10px;
            padding: 10px;
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            border-radius: 3px;
        }
        
        .auth-info code {
            background-color: var(--vscode-textPreformat-background);
            padding: 2px 4px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
        }
        
        .user-info {
            margin-bottom: 20px;
            padding: 15px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 5px;
            border: 1px solid var(--vscode-panel-border);
        }
        
        .user-details {
            display: flex;
            gap: 40px;
        }
        
        .user-column {
            flex: 1;
        }
        
        .user-field {
            margin-bottom: 8px;
        }
        
        .user-field strong {
            color: var(--vscode-foreground);
            margin-right: 8px;
        }
        
        .permission-icon {
            font-size: 16px;
            cursor: pointer;
            position: relative;
        }
        
        .permission-granted {
            color: #28a745;
        }
        
        .permission-denied {
            color: #dc3545;
        }
        
        .tooltip {
            position: absolute;
            background-color: var(--vscode-editorHoverWidget-background);
            border: 1px solid var(--vscode-editorHoverWidget-border);
            color: var(--vscode-editorHoverWidget-foreground);
            padding: 8px;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
            z-index: 1000;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            margin-bottom: 5px;
            display: none;
        }
        
        .permission-icon:hover .tooltip {
            display: block;
        }
        
        .collapsible-section {
            display: block;
        }
        
        .collapsible-section.collapsed {
            display: none;
        }
        
        .section-icon {
            margin-right: 5px;
            transition: transform 0.2s;
        }
        
        .section-icon.collapsed {
            transform: rotate(-90deg);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Salesforce Permission Inspector</h1>
    </div>
    
    <div class="input-section">
        <div class="input-group">
            <div class="user-search">
                <input type="text" id="userSearch" placeholder="Loading active standard users..." disabled />
                <div class="user-dropdown" id="userDropdown"></div>
            </div>
        </div>
    </div>
    
    <div class="user-info" id="userInfo" style="display: none;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <h3 style="margin: 0;">User Information</h3>
            <div>
                <button onclick="fetchPermissions()" id="analyzeBtn">Analyse Permissions</button>
                <div id="statusMessage" style="margin-top: 5px; font-style: italic; color: var(--vscode-descriptionForeground);"></div>
            </div>
        </div>
        <div class="user-details">
            <div class="user-column">
                <div class="user-field">
                    <strong>Name:</strong> <span id="userName"></span>
                </div>
                <div class="user-field">
                    <strong>Email:</strong> <span id="userEmailDisplay"></span>
                </div>
            </div>
            <div class="user-column">
                <div class="user-field">
                    <strong>Role:</strong> <span id="userRole"></span>
                </div>
                <div class="user-field">
                    <strong>Profile:</strong> <span id="userProfile"></span>
                </div>
            </div>
        </div>
    </div>
    
    <div class="table-container" id="resultsContainer" style="display: none;">
        
        <h3>Object Permissions</h3>
        <table id="objectTable">
            <thead>
                <tr>
                    <th>Object Name</th>
                    <th>Create</th>
                    <th>Read</th>
                    <th>Edit</th>
                    <th>Delete</th>
                    <th>View All Records</th>
                    <th>Modify All Records</th>
                    <th>View All Fields</th>
                </tr>
            </thead>
            <tbody id="objectTableBody">
            </tbody>
        </table>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let selectedUser = null;
        let searchTimeout = null;
        let allUsers = [];
        
        // Load users on page load
        vscode.postMessage({ command: 'loadUsers' });
        
        function fetchPermissions() {
            if (!selectedUser) {
                alert('Please select a user');
                return;
            }
            
            // Show loading message and hide results
            document.getElementById('statusMessage').textContent = 'Analysing permissions...';
            document.getElementById('resultsContainer').style.display = 'none';
            
            vscode.postMessage({
                command: 'fetchUserPermissions',
                email: selectedUser.Email
            });
        }
        
        function searchUsers(searchTerm) {
            if (searchTerm.length < 2) {
                document.getElementById('userDropdown').style.display = 'none';
                return;
            }
            
            vscode.postMessage({
                command: 'searchUsers',
                searchTerm: searchTerm,
                users: allUsers
            });
        }
        
        function selectUser(user) {
            selectedUser = user;
            document.getElementById('userSearch').value = user.Name + ' (' + user.Email + ')';
            document.getElementById('userDropdown').style.display = 'none';
            
            // ONLY show user info - NO permission fetching
            document.getElementById('userName').textContent = user.Name;
            document.getElementById('userEmailDisplay').textContent = user.Email;
            document.getElementById('userRole').textContent = (user.UserRole && user.UserRole.Name) ? user.UserRole.Name : 'No Role';
            document.getElementById('userProfile').textContent = (user.Profile && user.Profile.Name) ? user.Profile.Name : 'No Profile';
            document.getElementById('userInfo').style.display = 'block';
            
            // Hide object permissions section
            document.getElementById('resultsContainer').style.display = 'none';
        }
        
        document.getElementById('userSearch').addEventListener('input', function(e) {
            const searchTerm = e.target.value;
            selectedUser = null;
            document.getElementById('userInfo').style.display = 'none';
            
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchUsers(searchTerm);
            }, 300);
        });
        
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.user-search')) {
                document.getElementById('userDropdown').style.display = 'none';
            }
        });
        
        window.toggleFieldPermissions = function(objectName, userId, rowElement) {
            const fieldRow = document.querySelector('tr[data-field-for="' + objectName + '"]');
            const icon = rowElement.querySelector('.expand-icon');
            
            if (fieldRow) {
                const isExpanded = fieldRow.style.display === 'table-row';
                
                if (isExpanded) {
                    fieldRow.style.display = 'none';
                    icon.classList.remove('expanded');
                    icon.textContent = '▶';
                } else {
                    fieldRow.style.display = 'table-row';
                    icon.classList.add('expanded');
                    icon.textContent = '▼';
                    
                    const fieldContainer = fieldRow.querySelector('.field-permissions');
                    
                    if (fieldContainer) {
                        fieldContainer.style.display = 'block';
                        
                        if (!fieldContainer.dataset.loaded) {
                            const loading = fieldContainer.querySelector('.loading');
                            const sharingLoading = fieldContainer.querySelector('.sharing-loading');
                            
                            if (loading) loading.style.display = 'block';
                            if (sharingLoading) sharingLoading.style.display = 'block';
                            
                            vscode.postMessage({
                                command: 'fetchFieldPermissions',
                                objectName: objectName,
                                userId: userId
                            });
                            
                            vscode.postMessage({
                                command: 'fetchSharingDetails',
                                objectName: objectName,
                                userId: userId
                            });
                            
                            fieldContainer.dataset.loaded = 'true';
                        }
                    }
                }
            }
        }
        
        function getAccessLevelClass(level) {
            switch(level.toLowerCase()) {
                case 'full access': case 'full': case 'create': case 'delete': return 'access-full';
                case 'edit': case 'modify': return 'access-edit';
                case 'read only': case 'read': case 'view': return 'access-read';
                default: return 'access-none';
            }
        }
        
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'showLoading':
                    document.getElementById('loading').style.display = 'block';
                    document.getElementById('resultsContainer').style.display = 'none';
                    break;
                    
                case 'hideLoading':
                    document.getElementById('loading').style.display = 'none';
                    break;
                    
                case 'displayObjectPermissions':
                    displayObjectPermissions(message.data);
                    break;
                    
                case 'displayUserInfo':
                    displayUserInfo(message.data);
                    break;
                    
                case 'displayFieldPermissions':
                    displayFieldPermissions(message.data, message.objectName);
                    break;
                    
                case 'displaySharingDetails':
                    displaySharingDetails(message.data, message.objectName);
                    break;
                    
                case 'usersLoaded':
                    allUsers = message.data;
                    document.getElementById('userSearch').placeholder = 'Search ' + allUsers.length + ' users by name or email...';
                    document.getElementById('userSearch').disabled = false;
                    document.getElementById('userLoading').style.display = 'none';
                    break;
                    
                case 'displayUserSearchResults':
                    displayUserSearchResults(message.data);
                    break;
            }
        });
        
        function displayUserInfo(userInfo) {
            document.getElementById('userName').textContent = userInfo.name;
            document.getElementById('userEmailDisplay').textContent = userInfo.email;
            document.getElementById('userRole').textContent = userInfo.role;
            document.getElementById('userProfile').textContent = userInfo.profile;
        }
        
        function displayObjectPermissions(data) {
            document.getElementById('statusMessage').textContent = '';
            document.getElementById('resultsContainer').style.display = 'block';
            
            if (data.userInfo) {
                displayUserInfo(data.userInfo);
            }
            
            const permissions = data.permissions || data;
            const tbody = document.getElementById('objectTableBody');
            tbody.innerHTML = '';
            
            if (!permissions || permissions.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="no-data">No permissions found</td></tr>';
                return;
            }
            
            permissions.forEach(perm => {
                const row = document.createElement('tr');
                row.className = 'expandable-row';
                
                function createPermissionIcon(permission) {
                    const icon = permission.granted ? '✅' : '❌';
                    const className = permission.granted ? 'permission-granted' : 'permission-denied';
                    const tooltip = permission.sources.length > 0 ? permission.sources.join('\\n') : 'No permissions found';
                    
                    return \`<span class="permission-icon \${className}" title="\${tooltip}">\${icon}</span>\`;
                }
                
                row.setAttribute('data-object', perm.objectName);
                row.innerHTML = \`
                    <td style="cursor: pointer;" onclick="toggleFieldPermissions('\${perm.objectName}', '\${perm.userId}', this.parentElement)">
                        <span class="expand-icon">▶</span>
                        \${perm.objectName}
                    </td>
                    <td>\${createPermissionIcon(perm.permissions.create)}</td>
                    <td>\${createPermissionIcon(perm.permissions.read)}</td>
                    <td>\${createPermissionIcon(perm.permissions.edit)}</td>
                    <td>\${createPermissionIcon(perm.permissions.delete)}</td>
                    <td>\${createPermissionIcon(perm.permissions.viewAllRecords)}</td>
                    <td>\${createPermissionIcon(perm.permissions.modifyAllRecords)}</td>
                    <td>\${createPermissionIcon(perm.permissions.viewAllFields)}</td>
                \`;
                
                tbody.appendChild(row);
                
                const fieldRow = document.createElement('tr');
                fieldRow.style.display = 'none';
                fieldRow.setAttribute('data-field-for', perm.objectName);
                fieldRow.innerHTML = \`
                    <td colspan="8">
                        <div class="field-permissions">
                            <h4 onclick="toggleSection('field-\${perm.objectName}')" style="cursor: pointer;">
                                <span class="section-icon" id="field-icon-\${perm.objectName}">▼</span> Field Permissions for \${perm.objectName}
                            </h4>
                            <div id="field-\${perm.objectName}" class="collapsible-section">
                                <div class="loading" style="display: none;">Loading field permissions...</div>
                                <table class="field-table" style="display: none;">
                                    <thead>
                                        <tr>
                                            <th>Field Name</th>
                                            <th>Read</th>
                                            <th>Edit</th>
                                        </tr>
                                    </thead>
                                    <tbody class="field-tbody">
                                    </tbody>
                                </table>
                            </div>
                            <h4 onclick="toggleSection('sharing-\${perm.objectName}')" style="cursor: pointer;">
                                <span class="section-icon" id="sharing-icon-\${perm.objectName}">▼</span> Sharing Access for \${perm.objectName}
                            </h4>
                            <div id="sharing-\${perm.objectName}" class="collapsible-section">
                                <div class="sharing-loading" style="display: none; font-style: italic;">Loading sharing details...</div>
                                <table class="sharing-table" style="display: none;">
                                    <thead>
                                        <tr>
                                            <th>Sharing Type</th>
                                            <th>Shared Via</th>
                                            <th>Access Level</th>
                                        </tr>
                                    </thead>
                                    <tbody class="sharing-tbody">
                                    </tbody>
                                </table>
                            </div>                            
                        </div>
                    </td>
                \`;
                
                tbody.appendChild(fieldRow);
            });
        }
        
        function displayFieldPermissions(fieldPermissions, objectName) {
            const fieldContainers = document.querySelectorAll('.field-permissions');
            
            fieldContainers.forEach(container => {
                const title = container.querySelector('h4');
                if (title && title.textContent.includes(objectName)) {
                    const loading = container.querySelector('.loading');
                    const table = container.querySelector('.field-table');
                    const tbody = container.querySelector('.field-tbody');
                    const fieldRow = container.closest('tr');
                    
                    if (loading) loading.style.display = 'none';
                    if (table) table.style.display = 'table';
                    if (fieldRow) fieldRow.style.display = 'table-row';
                    
                    if (tbody) {
                        tbody.innerHTML = '';
                        
                        if (!fieldPermissions || fieldPermissions.length === 0) {
                            tbody.innerHTML = '<tr><td colspan="3" class="no-data">No field permissions found</td></tr>';
                            return;
                        }
                        
                        fieldPermissions.forEach(field => {
                            function createFieldPermissionIcon(permission) {
                                const icon = permission.granted ? '✅' : '❌';
                                const className = permission.granted ? 'permission-granted' : 'permission-denied';
                                const tooltip = permission.sources.length > 0 ? permission.sources.join('\\n') : 'No permissions found';
                                
                                return \`<span class="permission-icon \${className}" title="\${tooltip}">\${icon}</span>\`;
                            }
                            
                            const row = document.createElement('tr');
                            row.innerHTML = \`
                                <td>\${field.fieldName}</td>
                                <td>\${createFieldPermissionIcon(field.permissions.read)}</td>
                                <td>\${createFieldPermissionIcon(field.permissions.edit)}</td>
                            \`;
                            tbody.appendChild(row);
                        });
                    }
                }
            });
        }
        
        function displaySharingDetails(sharingDetails, objectName) {
            const fieldContainers = document.querySelectorAll('.field-permissions');
            
            fieldContainers.forEach(container => {
                const sharingTitle = container.querySelectorAll('h4')[1];
                if (sharingTitle && sharingTitle.textContent.includes(objectName)) {
                    const loading = container.querySelector('.sharing-loading');
                    const table = container.querySelector('.sharing-table');
                    const tbody = container.querySelector('.sharing-tbody');
                    
                    if (loading) loading.style.display = 'none';
                    if (table) table.style.display = 'table';
                    
                    if (tbody) {
                        tbody.innerHTML = '';
                        
                        if (!sharingDetails || sharingDetails.length === 0) {
                            tbody.innerHTML = '<tr><td colspan="3" class="no-data">No sharing access found</td></tr>';
                            return;
                        }
                        
                        sharingDetails.forEach(sharing => {
                            const row = document.createElement('tr');
                            const tooltip = sharing.tooltip ? ' title="' + sharing.tooltip + '"' : '';
                            row.innerHTML = '<td' + tooltip + '>' + sharing.type + '</td>' +
                                           '<td' + tooltip + '>' + sharing.name + '</td>' +
                                           '<td' + tooltip + '><span class="access-level ' + getAccessLevelClass(sharing.access) + '">' + sharing.access + '</span></td>';
                            tbody.appendChild(row);
                        });
                    }
                }
            });
        }
        
        window.toggleSection = function(sectionId) {
            const section = document.getElementById(sectionId);
            const icon = document.getElementById(sectionId.replace('field-', 'field-icon-').replace('sharing-', 'sharing-icon-'));
            
            if (section.classList.contains('collapsed')) {
                section.classList.remove('collapsed');
                icon.classList.remove('collapsed');
                icon.textContent = '▼';
            } else {
                section.classList.add('collapsed');
                icon.classList.add('collapsed');
                icon.textContent = '▶';
            }
        }
        
        function displayUserSearchResults(users) {
            const dropdown = document.getElementById('userDropdown');
            dropdown.innerHTML = '';
            
            if (users.length === 0) {
                dropdown.innerHTML = '<div class="user-option">No users found</div>';
            } else {
                users.forEach(user => {
                    const option = document.createElement('div');
                    option.className = 'user-option';
                    option.innerHTML = '<div class="user-name">' + user.Name + '</div><div class="user-email">' + user.Email + '</div>';
                    option.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        selectUser(user);
                        return false;
                    });
                    dropdown.appendChild(option);
                });
            }
            
            dropdown.style.display = 'block';
        }
        

    </script>
</body>
</html>`;
    }
}

module.exports = PermissionManagerPanel;