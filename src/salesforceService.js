const vscode = require('vscode');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class SalesforceService {
    constructor() {
        this.accessToken = null;
        this.instanceUrl = null;
    }

    async authenticate() {
        if (this.accessToken) return;

        try {
            // Check if Salesforce CLI is installed
            await execAsync('sf --version');
        } catch (error) {
            throw new Error('Salesforce CLI not found. Please install it first: npm install -g @salesforce/cli');
        }

        try {
            // Get org info from Salesforce CLI
            const { stdout } = await execAsync('sf org display --json');
            const orgInfo = JSON.parse(stdout);
            
            if (!orgInfo.result) {
                throw new Error('No authenticated org found. Please run: sf org login web');
            }

            this.instanceUrl = orgInfo.result.instanceUrl;
            this.accessToken = orgInfo.result.accessToken;

            if (!this.instanceUrl || !this.accessToken) {
                throw new Error('Unable to get org credentials. Please run: sf org login web');
            }

        } catch (error) {
            if (error.message.includes('No authenticated org found') || error.message.includes('Unable to get org credentials')) {
                throw error;
            }
            throw new Error('Authentication failed. Please run: sf org login web');
        }
    }

    async makeRequest(endpoint, method = 'GET', data = null) {
        await this.authenticate();

        const config = {
            method,
            url: `${this.instanceUrl}/services/data/v63.0${endpoint}`,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            }
        };

        if (data) config.data = data;

        try {
            const response = await axios(config);
            return response.data;
        } catch (error) {
            if (error.response?.status === 401) {
                this.accessToken = null;
                throw new Error('Authentication failed. Please check your credentials.');
            }
            throw new Error(`Salesforce API Error: ${error.response?.data?.message || error.message}`);
        }
    }

    async getUserObjectPermissions(email) {
        try {
            // Find user by email
            const userQuery = `/query/?q=SELECT Id, Name, ProfileId, Profile.Name, UserRoleId, UserRole.Name FROM User WHERE Email = '${email}' AND IsActive = true LIMIT 1`;
            const userResult = await this.makeRequest(userQuery);

            if (!userResult.records || userResult.records.length === 0) {
                throw new Error(`User with email ${email} not found or inactive`);
            }

            const user = userResult.records[0];
            const userId = user.Id;
            const profileId = user.ProfileId;

            // Get all objects that are queryable, updatable, deletable and deployable
            const objectsResult = await this.makeRequest('/sobjects/');
            
            const objects = objectsResult.sobjects.filter(obj => 
                obj.queryable && 
                obj.updateable && 
                obj.deletable && 
                obj.createable &&
                obj.triggerable &&
                !obj.customSetting && 
                !obj.deprecatedAndHidden &&
                obj.name.indexOf('__Tag') === -1 && 
                obj.name.indexOf('__History') === -1 && 
                obj.name.indexOf('__Share') === -1 &&
                obj.name.indexOf('__Feed') === -1 &&
                obj.name.indexOf('__ChangeEvent') === -1 &&
                obj.name.indexOf('__mdt') === -1
            );

            const permissions = [];

            // Get permission set assignments
            const permSetAssignQuery = `/query/?q=SELECT PermissionSetId FROM PermissionSetAssignment WHERE AssigneeId = '${userId}'`;
            const permSetAssignments = await this.makeRequest(permSetAssignQuery);
            const permissionSetIds = permSetAssignments.records.map(psa => psa.PermissionSetId);
            
            // Get permission set group assignments (if available)
            let permissionSetGroupIds = [];
            try {
                const permSetGroupQuery = `/query/?q=SELECT PermissionSetGroupId FROM PermissionSetGroupAssignment WHERE AssigneeId = '${userId}'`;
                const permSetGroupAssignments = await this.makeRequest(permSetGroupQuery);
                permissionSetGroupIds = permSetGroupAssignments.records.map(psga => psga.PermissionSetGroupId);
            } catch (e) {
                // Permission Set Groups not available in this org
            }

            // Get all object permissions in one query
            const allParentIds = [profileId, ...permissionSetIds, ...permissionSetGroupIds];
            let allObjectPerms = { records: [] };
            
            if (allParentIds.length > 0) {
                const parentIdList = allParentIds.map(id => `'${id}'`).join(',');
                const allObjectPermsQuery = `/query/?q=SELECT SobjectType, PermissionsCreate, PermissionsRead, PermissionsEdit, PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords, PermissionsViewAllFields, Parent.ProfileId, Parent.Profile.Name, Parent.Name FROM ObjectPermissions WHERE ParentId IN (${parentIdList})`;
                allObjectPerms = await this.makeRequest(allObjectPermsQuery);
            }

            // Process permissions for each object
            for (const obj of objects) {
                const objectName = obj.name;
                const objPerms = allObjectPerms.records.filter(p => p.SobjectType === objectName);

                const objectPermissions = {
                    create: { granted: false, sources: [] },
                    read: { granted: false, sources: [] },
                    edit: { granted: false, sources: [] },
                    delete: { granted: false, sources: [] },
                    viewAllRecords: { granted: false, sources: [] },
                    modifyAllRecords: { granted: false, sources: [] },
                    viewAllFields: { granted: false, sources: [] }
                };

                // Check each permission record
                for (const perm of objPerms) {
                    let sourceName;
                    if (perm.Parent?.ProfileId) {
                        sourceName = `${perm.Parent.Profile?.Name} (Profile)`;
                    } else if (permissionSetGroupIds.includes(perm.ParentId)) {
                        sourceName = `${perm.Parent?.Name} (Permission Set Group)`;
                    } else {
                        sourceName = `${perm.Parent?.Name} (Permission Set)`;
                    }
                    
                    if (perm.PermissionsCreate) {
                        objectPermissions.create.granted = true;
                        objectPermissions.create.sources.push(sourceName);
                    }
                    if (perm.PermissionsRead) {
                        objectPermissions.read.granted = true;
                        objectPermissions.read.sources.push(sourceName);
                    }
                    if (perm.PermissionsEdit) {
                        objectPermissions.edit.granted = true;
                        objectPermissions.edit.sources.push(sourceName);
                    }
                    if (perm.PermissionsDelete) {
                        objectPermissions.delete.granted = true;
                        objectPermissions.delete.sources.push(sourceName);
                    }
                    if (perm.PermissionsViewAllRecords) {
                        objectPermissions.viewAllRecords.granted = true;
                        objectPermissions.viewAllRecords.sources.push(sourceName);
                    }
                    if (perm.PermissionsModifyAllRecords) {
                        objectPermissions.modifyAllRecords.granted = true;
                        objectPermissions.modifyAllRecords.sources.push(sourceName);
                    }
                    if (perm.PermissionsViewAllFields) {
                        objectPermissions.viewAllFields.granted = true;
                        objectPermissions.viewAllFields.sources.push(sourceName);
                    }
                }

                permissions.push({
                    objectName: objectName,
                    permissions: objectPermissions,
                    userId: userId
                });
            }

            return {
                userInfo: {
                    name: user.Name,
                    email: email,
                    role: user.UserRole?.Name || 'No Role',
                    profile: user.Profile.Name
                },
                permissions: permissions.sort((a, b) => a.objectName.localeCompare(b.objectName))
            };

        } catch (error) {
            throw new Error(`Failed to fetch user permissions: ${error.message}`);
        }
    }

    async getObjectSharingAccess(objectName, userId) {
        console.log(`Getting sharing access for ${objectName}, userId: ${userId}`);
        
        const results = [];
        
        try {
            // Step 1: Get OWD as baseline
            let owdAccess = 'No Access';
            let owdSetting = 'Private';
            
            try {
                const entityQuery = `/tooling/query/?q=SELECT InternalSharingModel FROM EntityDefinition WHERE QualifiedApiName = '${objectName}' LIMIT 1`;
                const entityResult = await this.makeRequest(entityQuery);
                
                if (entityResult.records.length > 0) {
                    owdSetting = entityResult.records[0].InternalSharingModel;
                }
            } catch (e) {
                const owdQuery = `/query/?q=SELECT DefaultCaseAccess, DefaultContactAccess, DefaultAccountAccess, DefaultOpportunityAccess, DefaultLeadAccess FROM OrganizationSettings LIMIT 1`;
                const owd = await this.makeRequest(owdQuery);
                if (owd.records.length > 0) {
                    const settings = owd.records[0];
                    switch(objectName) {
                        case 'Account': owdSetting = settings.DefaultAccountAccess || 'Private'; break;
                        case 'Contact': owdSetting = settings.DefaultContactAccess || 'Private'; break;
                        case 'Case': owdSetting = settings.DefaultCaseAccess || 'Private'; break;
                        case 'Opportunity': owdSetting = settings.DefaultOpportunityAccess || 'Private'; break;
                        case 'Lead': owdSetting = settings.DefaultLeadAccess || 'Private'; break;
                    }
                }
            }
            
            if (owdSetting === 'Read') owdAccess = 'Read Only';
            else if (owdSetting === 'ReadWrite' || owdSetting === 'Edit') owdAccess = 'Edit';
            
            console.log(`OWD: ${owdSetting} -> ${owdAccess}`);
            
            // Step 2: Check Queue access
            let queueAccess = null;
            const queueQuery = `/query/?q=SELECT QueueId, Queue.Name FROM QueueSobject WHERE SobjectType = '${objectName}'`;
            const queues = await this.makeRequest(queueQuery);
            
            for (const queue of queues.records) {
                const memberQuery = `/query/?q=SELECT UserOrGroupId FROM GroupMember WHERE GroupId = '${queue.QueueId}' AND UserOrGroupId = '${userId}'`;
                const membership = await this.makeRequest(memberQuery);
                
                if (membership.records.length > 0) {
                    queueAccess = { name: queue.Queue.Name, access: 'Edit' };
                    console.log(`Queue access found: ${queue.Queue.Name} -> Edit`);
                    break;
                }
            }
            
            // Always show OWD
            results.push({
                type: 'OWD',
                name: 'Internal Sharing Model',
                access: owdAccess
            });
            
            // Show Queue access if user has it
            if (queueAccess) {
                results.push({
                    type: 'Queue Access',
                    name: queueAccess.name,
                    access: queueAccess.access
                });
            }
            
            // Show ALL sharing rules user has access to
            const allSharingRules = await this.getSharingRuleAccess(objectName, userId);
            console.log(`All sharing rules user has access to:`, allSharingRules);
            
            for (const rule of allSharingRules) {
                results.push({
                    type: rule.ruleType,
                    name: rule.ruleName,
                    access: rule.access,
                    tooltip: rule.criteriaStatement
                });
            }
            
        } catch (error) {
            console.log('Error getting sharing access:', error.message);
        }
        
        console.log('Final sharing results:', results);
        return results;
    }

    async getSharingRuleAccess(objectName, userId) {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const xml2js = require('xml2js');
        
        const sharingAccess = [];
        
        try {
            // Create temp directory in project folder
            const tempDir = path.join(process.cwd(), 'temp-sharing-rules');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            // Retrieve sharing rules metadata
            const retrieveCmd = `sf project retrieve start -m "SharingRules:${objectName}" -r "${tempDir}"`;
            console.log(`Executing: ${retrieveCmd}`);
            await execAsync(retrieveCmd);
            
            // List directory contents to debug
            console.log('Temp directory contents:');
            if (fs.existsSync(tempDir)) {
                const listDir = (dir, level = 0) => {
                    const items = fs.readdirSync(dir);
                    items.forEach(item => {
                        const fullPath = path.join(dir, item);
                        const indent = '  '.repeat(level);
                        if (fs.statSync(fullPath).isDirectory()) {
                            console.log(`${indent}${item}/`);
                            if (level < 3) listDir(fullPath, level + 1);
                        } else {
                            console.log(`${indent}${item}`);
                        }
                    });
                };
                listDir(tempDir);
            }
            
            // Find XML file anywhere in temp directory
            let xmlPath = null;
            const findXmlFile = (dir) => {
                const items = fs.readdirSync(dir);
                for (const item of items) {
                    const fullPath = path.join(dir, item);
                    if (fs.statSync(fullPath).isDirectory()) {
                        const found = findXmlFile(fullPath);
                        if (found) return found;
                    } else if (item.includes(`${objectName}.sharingRules`) && item.endsWith('.xml')) {
                        return fullPath;
                    }
                }
                return null;
            };
            
            xmlPath = findXmlFile(tempDir);
            console.log(`Found XML at: ${xmlPath}`);
            
            if (xmlPath && fs.existsSync(xmlPath)) {
                console.log('XML file found, reading content');
                const xmlContent = fs.readFileSync(xmlPath, 'utf8');
                console.log('XML content:', xmlContent.substring(0, 500));
                
                const parser = new xml2js.Parser();
                const result = await parser.parseStringPromise(xmlContent);
                console.log('Parsed XML result:', JSON.stringify(result, null, 2));
                
                // Find all sharing rules with their access levels
                const sharingRules = this.findSharingRulesWithAccess(result);
                console.log(`Found ${sharingRules.length} sharing rules`);
                
                for (const rule of sharingRules) {
                    console.log('Checking rule:', rule);
                    const access = await this.checkSharingRuleAccess(rule.sharedTo, userId);
                    console.log('Access result:', access);
                    if (access.hasAccess) {
                        // Map XML accessLevel to display format
                        const accessLevel = rule.accessLevel === 'Edit' ? 'Edit' : 'Read Only';
                        console.log(`Rule ${rule.ruleName} has accessLevel: ${rule.accessLevel} -> ${accessLevel}`);
                        sharingAccess.push({
                            ruleType: rule.ruleType,
                            ruleName: rule.ruleName,
                            access: accessLevel,
                            criteriaStatement: rule.criteriaStatement
                        });
                    }
                }
            } else {
                console.log('XML file not found');
            }
            
        } catch (error) {
            console.log('Error processing sharing rules:', error.message);
        } finally {
            // Cleanup temp directory
            const tempDir = path.join(process.cwd(), 'temp-sharing-rules');
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
                console.log('Cleaned up temp directory');
            }
        }
        
        return sharingAccess;
    }
    
    buildCriteriaStatement(criteriaItems, booleanFilter) {
        if (!criteriaItems || criteriaItems.length === 0) return '';
        
        const criteria = criteriaItems.map((item, index) => {
            const field = item.field[0];
            const operation = item.operation[0];
            const value = item.value[0];
            return `${field} ${operation} ${value}`;
        });
        
        if (booleanFilter && booleanFilter[0]) {
            let filter = booleanFilter[0];
            criteria.forEach((criterion, index) => {
                filter = filter.replace(new RegExp(`\\b${index + 1}\\b`, 'g'), criterion);
            });
            return filter;
        } else {
            return criteria.join(' AND ');
        }
    }
    
    buildOwnerStatement(sharedFrom) {
        if (sharedFrom.role) {
            return `Records owned by users in role: ${sharedFrom.role[0]}`;
        } else if (sharedFrom.roleAndSubordinates) {
            return `Records owned by users in role and subordinates: ${sharedFrom.roleAndSubordinates[0]}`;
        } else if (sharedFrom.group) {
            return `Records owned by users in group: ${sharedFrom.group[0]}`;
        }
        return '';
    }
    
    findSharingRulesWithAccess(obj) {
        const sharingRules = [];
        
        const traverse = (node, ruleType = null) => {
            if (typeof node === 'object' && node !== null) {
                if (node.sharedTo && node.accessLevel && node.fullName) {
                    let criteriaStatement = '';
                    
                    if (ruleType === 'Criteria-Based Rule' && node.criteriaItems) {
                        criteriaStatement = this.buildCriteriaStatement(node.criteriaItems, node.booleanFilter);
                    } else if (ruleType === 'Owner-Based Rule' && node.sharedFrom) {
                        criteriaStatement = this.buildOwnerStatement(node.sharedFrom[0]);
                    }
                    
                    sharingRules.push({
                        sharedTo: node.sharedTo[0],
                        accessLevel: node.accessLevel[0],
                        ruleName: node.fullName[0],
                        ruleType: ruleType,
                        criteriaStatement: criteriaStatement
                    });
                }
                for (const key in node) {
                    let currentRuleType = ruleType;
                    if (key === 'sharingCriteriaRules') {
                        currentRuleType = 'Criteria-Based Rule';
                    } else if (key === 'sharingOwnerRules') {
                        currentRuleType = 'Owner-Based Rule';
                    }
                    
                    if (Array.isArray(node[key])) {
                        node[key].forEach(item => traverse(item, currentRuleType));
                    } else if (typeof node[key] === 'object') {
                        traverse(node[key], currentRuleType);
                    }
                }
            }
        };
        
        traverse(obj);
        return sharingRules;
    }
    
    async checkSharingRuleAccess(sharedTo, userId) {
        try {
            if (sharedTo.allInternalUsers) {
                return { hasAccess: true, reason: 'Internal User' };
            }
            
            if (sharedTo.group) {
                const groupAccess = await this.checkGroupAccess(sharedTo.group[0], userId);
                return { hasAccess: groupAccess, reason: `Group: ${sharedTo.group[0]}` };
            }
            
            if (sharedTo.role) {
                const roleAccess = await this.checkRoleAccess(sharedTo.role[0], userId, false);
                return { hasAccess: roleAccess, reason: `Role: ${sharedTo.role[0]}` };
            }
            
            if (sharedTo.roleAndSubordinates) {
                const roleAccess = await this.checkRoleAccess(sharedTo.roleAndSubordinates[0], userId, true);
                return { hasAccess: roleAccess, reason: `Role and Subordinates: ${sharedTo.roleAndSubordinates[0]}` };
            }
            
            if (sharedTo.roleAndSubordinatesInternal) {
                const roleAccess = await this.checkRoleAccess(sharedTo.roleAndSubordinatesInternal[0], userId, true);
                return { hasAccess: roleAccess, reason: `Role and Internal Subordinates: ${sharedTo.roleAndSubordinatesInternal[0]}` };
            }
            
        } catch (error) {
            console.log('Error checking sharing rule access:', error.message);
        }
        
        return { hasAccess: false, reason: 'No Access' };
    }
    
    async checkGroupAccess(groupName, userId) {
        try {
            const groupQuery = `/query/?q=SELECT Id FROM Group WHERE DeveloperName = '${groupName}' LIMIT 1`;
            const groupResult = await this.makeRequest(groupQuery);
            
            if (groupResult.records.length === 0) return false;
            
            const groupId = groupResult.records[0].Id;
            
            // Check direct user membership
            const memberQuery = `/query/?q=SELECT UserOrGroupId FROM GroupMember WHERE GroupId = '${groupId}' AND UserOrGroupId = '${userId}'`;
            const memberResult = await this.makeRequest(memberQuery);
            
            if (memberResult.records.length > 0) return true;
            
            // Check nested group membership recursively
            const nestedGroupQuery = `/query/?q=SELECT UserOrGroupId FROM GroupMember WHERE GroupId = '${groupId}' AND UserOrGroupId IN (SELECT Id FROM Group)`;
            const nestedGroups = await this.makeRequest(nestedGroupQuery);
            
            for (const nestedGroup of nestedGroups.records) {
                const nestedGroupNameQuery = `/query/?q=SELECT DeveloperName FROM Group WHERE Id = '${nestedGroup.UserOrGroupId}' LIMIT 1`;
                const nestedGroupNameResult = await this.makeRequest(nestedGroupNameQuery);
                
                if (nestedGroupNameResult.records.length > 0) {
                    const nestedGroupName = nestedGroupNameResult.records[0].DeveloperName;
                    const hasAccess = await this.checkGroupAccess(nestedGroupName, userId);
                    if (hasAccess) return true;
                }
            }
            
            return false;
        } catch (error) {
            return false;
        }
    }
    
    async checkRoleAccess(roleName, userId, includeSubordinates) {
        try {
            const userQuery = `/query/?q=SELECT UserRoleId, UserRole.DeveloperName FROM User WHERE Id = '${userId}'`;
            const userResult = await this.makeRequest(userQuery);
            
            if (userResult.records.length === 0) return false;
            
            const userRole = userResult.records[0].UserRole?.DeveloperName;
            if (userRole === roleName) return true;
            
            if (includeSubordinates) {
                const roleQuery = `/query/?q=SELECT Id FROM UserRole WHERE DeveloperName = '${roleName}' LIMIT 1`;
                const roleResult = await this.makeRequest(roleQuery);
                
                if (roleResult.records.length > 0) {
                    const roleId = roleResult.records[0].Id;
                    const subordinateQuery = `/query/?q=SELECT DeveloperName FROM UserRole WHERE ParentRoleId = '${roleId}'`;
                    const subordinates = await this.makeRequest(subordinateQuery);
                    
                    for (const sub of subordinates.records) {
                        const subAccess = await this.checkRoleAccess(sub.DeveloperName, userId, true);
                        if (subAccess) return true;
                    }
                }
            }
            
        } catch (error) {
            return false;
        }
        
        return false;
    }

    async getAllActiveStandardUsers() {
        try {
            const query = `/query/?q=SELECT Id, Name, Email, UserRole.Name, Profile.Name FROM User WHERE IsActive = true AND UserType = 'Standard' ORDER BY Name`;
            const result = await this.makeRequest(query);
            return result.records;
        } catch (error) {
            throw new Error(`Failed to load users: ${error.message}`);
        }
    }

    searchUsers(users, searchTerm) {
        if (!searchTerm || searchTerm.length < 2) return [];
        
        const term = searchTerm.toLowerCase();
        return users.filter(user => 
            user.Name.toLowerCase().includes(term) || 
            user.Email.toLowerCase().includes(term)
        ).slice(0, 20);
    }

    async getFieldPermissions(objectName, userId) {
        try {
            // Get user's profile
            const userQuery = `/query/?q=SELECT ProfileId, Profile.Name FROM User WHERE Id = '${userId}'`;
            const userResult = await this.makeRequest(userQuery);
            const user = userResult.records[0];
            const profileId = user.ProfileId;

            // Get object fields
            const objectDesc = await this.makeRequest(`/sobjects/${objectName}/describe/`);
            const fields = objectDesc.fields.filter(field => 
                !field.compoundFieldName && field.permissionable
            ).slice(0, 30);

            // Get permission set assignments
            const permSetAssignQuery = `/query/?q=SELECT PermissionSetId FROM PermissionSetAssignment WHERE AssigneeId = '${userId}'`;
            const permSetAssignments = await this.makeRequest(permSetAssignQuery);
            const permissionSetIds = permSetAssignments.records.map(psa => psa.PermissionSetId);
            
            // Get all field permissions
            const allParentIds = [profileId, ...permissionSetIds];
            let allFieldPerms = { records: [] };
            
            if (allParentIds.length > 0) {
                const parentIdList = allParentIds.map(id => `'${id}'`).join(',');
                const fieldPermsQuery = `/query/?q=SELECT Field, PermissionsRead, PermissionsEdit, Parent.ProfileId, Parent.Profile.Name, Parent.Name FROM FieldPermissions WHERE ParentId IN (${parentIdList}) AND SobjectType = '${objectName}'`;
                allFieldPerms = await this.makeRequest(fieldPermsQuery);
            }

            const fieldPermissions = [];

            for (const field of fields) {
                const fieldName = `${objectName}.${field.name}`;
                const fieldPerms = allFieldPerms.records.filter(p => p.Field === fieldName);

                const permissions = {
                    read: { granted: false, sources: [] },
                    edit: { granted: false, sources: [] }
                };

                // Check explicit field permissions
                for (const fieldPerm of fieldPerms) {
                    const sourceName = fieldPerm.Parent?.ProfileId ? `${fieldPerm.Parent.Profile?.Name} (Profile)` : `${fieldPerm.Parent?.Name} (Permission Set)`;
                    
                    if (fieldPerm.PermissionsRead) {
                        permissions.read.granted = true;
                        permissions.read.sources.push(sourceName);
                    }
                    if (fieldPerm.PermissionsEdit) {
                        permissions.edit.granted = true;
                        permissions.edit.sources.push(sourceName);
                    }
                }

                fieldPermissions.push({
                    fieldName: field.name,
                    permissions: permissions
                });
            }

            return fieldPermissions.sort((a, b) => a.fieldName.localeCompare(b.fieldName));

        } catch (error) {
            throw new Error(`Failed to fetch field permissions: ${error.message}`);
        }
    }
}

module.exports = SalesforceService;