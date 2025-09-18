# Salesforce Permission Inspector

A VS Code extension for analyzing and inspecting Salesforce user permissions with detailed access levels and sources.

## Features

### 🔍 User Search & Selection
- **Smart User Search**: Search active standard users by name or email
- **Pre-loaded User Cache**: Fast client-side filtering from cached user list
- **User Information Display**: Shows selected user's name, email, role, and profile

### 🛡️ Object Permissions Analysis
- **Comprehensive Object Coverage**: Analyzes all triggerable, queryable, updatable, deletable, and creatable objects
- **Permission Sources**: Shows exactly where permissions come from (Profile, Permission Sets, etc.)
- **Visual Indicators**: ✅/❌ icons with tooltips showing permission sources
- **Access Level Analysis**: 
  - Create permissions
  - Read permissions  
  - Edit permissions
  - Delete permissions
  - View All Records
  - Modify All Records
  - View All Fields

  ![Object Permissions Analysis](https://raw.githubusercontent.com/shabu74/sf-permissions-inspector/main/screenshots/main.png)
  *Object Permissions*

### 📋 Field-Level Security
- **Expandable Field Details**: Click any object to view field permissions
- **Field Access Matrix**: Shows read/edit permissions for each field
- **Permission Traceability**: Tooltips show which profiles/permission sets grant access

  ![Field-Level Security](https://raw.githubusercontent.com/shabu74/sf-permissions-inspector/main/screenshots/field-permission.png)
  *Field-Level Security*

### 🤝 Sharing Rules Analysis
- **Sharing Rule Detection**: Identifies all sharing rules affecting the user
- **Rule Types**: Shows Owner-Based and Criteria-Based sharing rules
- **Access Levels**: Displays the access level granted by each rule
- **Criteria Tooltips**: Hover to see sharing rule criteria and conditions

  ![Sharing Rules Analysis](https://raw.githubusercontent.com/shabu74/sf-permissions-inspector/main/screenshots/sharing.png)
  *Sharing Access*

### ⚡ Performance Features
- **Efficient Loading**: Pre-loads users on startup for fast search
- **Dynamic Object Discovery**: Automatically discovers available objects in your org
- **Smart Filtering**: Only shows objects that support triggers and are fully manageable
- **Lazy Loading**: Field permissions and sharing details load on-demand

## Usage

1. **Open the Inspector**: Use Command Palette (`Ctrl+Shift+P`) → "Salesforce: Open Permission Inspector"
2. **Search for User**: Type user name or email in the search box
3. **Select User**: Click on a user from the dropdown to view their information
4. **Analyse Permissions**: Click "Analyse Permissions" to start the analysis
5. **Explore Details**: Click on any object row to expand field permissions and sharing details

## Requirements

- VS Code 1.74.0 or higher
- Active Salesforce connection with appropriate API access
- User permissions to query User, Profile, PermissionSet, and sharing rule metadata

## Authentication

The extension uses your existing Salesforce CLI authentication. Ensure you're logged in to your target org using:
```bash
sf org login web
```

## Supported Objects

The extension automatically discovers and analyzes:
- All standard Salesforce objects (Account, Contact, Lead, Opportunity, etc.)
- Custom objects (those ending with `__c`)
- Objects that support Apex triggers
- Objects that are queryable, creatable, updatable, and deletable

## Extension Settings

This extension contributes the following settings:
- Currently no configurable settings (uses default Salesforce CLI authentication)

## Known Issues

- Large orgs with many custom objects may take longer to load initially
- Field permissions for objects with 100+ fields may take a few seconds to load

## Release Notes

### 1.0.0
- Initial release
- User search and selection
- Object permission analysis
- Field-level security inspection
- Sharing rules analysis with criteria tooltips
- Dynamic object discovery

## Contributing

This extension is part of the CloudXPlorer project for Salesforce development tools.

## License

MIT License