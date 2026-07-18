#define MyAppName "MedCareSO"
#define MyAppVersion "2.1.1"
#define MyAppPublisher "MedCareSO Team"
#define MyAppExeName "MedCareSO.exe"

[Setup]
AppId={{A9D40EC1-3D97-45E2-9467-0647A0CF7C62}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription=Installation de {#MyAppName}
VersionInfoProductName={#MyAppName}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
LicenseFile=LICENSE
OutputDir=dist\inno
OutputBaseFilename=MedCareSO-{#MyAppVersion}-Setup-Inno
SetupIconFile=dist\.icon-ico\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
UninstallDisplayIcon={app}\{#MyAppExeName}
CloseApplications=force
RestartApplications=no
CloseApplicationsFilter={#MyAppExeName}
MinVersion=10.0.17763

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "Créer un raccourci sur le Bureau"; GroupDescription: "Raccourcis :"; Flags: checkedonce

[Files]
Source: "dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "SETUP_WINDOWS\SCRIPT_POSTGRESQL_COMPLET.sql"; DestDir: "{app}\setup"; Flags: ignoreversion
Source: "SETUP_WINDOWS\PROTOCOLE_MIGRATION_CLIENT_EXISTANT_POSTGRESQL.txt"; DestDir: "{app}\setup"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\Désinstaller {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""MedCareSO Portail Patient LAN"""; Flags: runhidden; Check: IsServerDeployment
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""MedCareSO Portail Patient LAN"" dir=in action=allow program=""{app}\{#MyAppExeName}"" enable=yes profile=any remoteip=localsubnet"; Flags: runhidden; Check: IsServerDeployment
Filename: "{app}\{#MyAppExeName}"; Description: "Lancer {#MyAppName}"; Flags: nowait postinstall skipifsilent runasoriginaluser

[UninstallRun]
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""MedCareSO Portail Patient LAN"""; Flags: runhidden; RunOnceId: "RemovePatientPortalFirewallRule"

[Code]
var
  DeploymentPage: TInputOptionWizardPage;
  DatabasePage: TWizardPage;
  HostLabel: TNewStaticText;
  HostEdit: TNewEdit;
  PortLabel: TNewStaticText;
  PortEdit: TNewEdit;
  DatabaseLabel: TNewStaticText;
  DatabaseEdit: TNewEdit;
  UserLabel: TNewStaticText;
  UserEdit: TNewEdit;
  PasswordLabel: TNewStaticText;
  PasswordEdit: TNewEdit;
  DatabaseHelp: TNewStaticText;

function JsonEscape(Value: String): String;
begin
  Result := Value;
  StringChangeEx(Result, '\', '\\', True);
  StringChangeEx(Result, '"', '\"', True);
end;

function IsServerDeployment: Boolean;
begin
  Result := Assigned(DeploymentPage) and (DeploymentPage.SelectedValueIndex = 0);
end;

procedure InitializeWizard;
begin
  DeploymentPage := CreateInputOptionPage(
    wpSelectDir,
    'Type de poste',
    'Choisissez le rôle de ce PC dans le réseau du cabinet.',
    'La base PostgreSQL doit être créée manuellement avant cette installation.',
    True,
    False
  );
  DeploymentPage.Add('PC serveur / principal : PostgreSQL est installé sur ce PC');
  DeploymentPage.Add('PC client : PostgreSQL est installé sur un autre PC du réseau');
  DeploymentPage.SelectedValueIndex := 0;

  DatabasePage := CreateCustomPage(
    DeploymentPage.ID,
    'Connexion PostgreSQL',
    'Saisissez la base déjà créée pour MedCareSO.'
  );

  DatabaseHelp := TNewStaticText.Create(DatabasePage);
  DatabaseHelp.Parent := DatabasePage.Surface;
  DatabaseHelp.Left := 0;
  DatabaseHelp.Top := 0;
  DatabaseHelp.Width := DatabasePage.SurfaceWidth;
  DatabaseHelp.Height := ScaleY(48);
  DatabaseHelp.AutoSize := False;
  DatabaseHelp.WordWrap := True;
  DatabaseHelp.Caption :=
    'L''installeur vérifiera l''authentification avant de lancer le logiciel. ' +
    'Serveur local : 127.0.0.1. PC client : adresse IPv4 du PC serveur.';

  HostLabel := TNewStaticText.Create(DatabasePage);
  HostLabel.Parent := DatabasePage.Surface;
  HostLabel.Caption := 'Adresse du serveur PostgreSQL :';
  HostLabel.Left := 0;
  HostLabel.Top := ScaleY(58);

  HostEdit := TNewEdit.Create(DatabasePage);
  HostEdit.Parent := DatabasePage.Surface;
  HostEdit.Left := 0;
  HostEdit.Top := ScaleY(78);
  HostEdit.Width := DatabasePage.SurfaceWidth;
  HostEdit.Text := '127.0.0.1';

  PortLabel := TNewStaticText.Create(DatabasePage);
  PortLabel.Parent := DatabasePage.Surface;
  PortLabel.Caption := 'Port :';
  PortLabel.Left := 0;
  PortLabel.Top := ScaleY(112);

  PortEdit := TNewEdit.Create(DatabasePage);
  PortEdit.Parent := DatabasePage.Surface;
  PortEdit.Left := 0;
  PortEdit.Top := ScaleY(132);
  PortEdit.Width := ScaleX(100);
  PortEdit.Text := '5432';

  DatabaseLabel := TNewStaticText.Create(DatabasePage);
  DatabaseLabel.Parent := DatabasePage.Surface;
  DatabaseLabel.Caption := 'Nom de la base :';
  DatabaseLabel.Left := ScaleX(120);
  DatabaseLabel.Top := ScaleY(112);

  DatabaseEdit := TNewEdit.Create(DatabasePage);
  DatabaseEdit.Parent := DatabasePage.Surface;
  DatabaseEdit.Left := ScaleX(120);
  DatabaseEdit.Top := ScaleY(132);
  DatabaseEdit.Width := DatabasePage.SurfaceWidth - ScaleX(120);
  DatabaseEdit.Text := 'cabinet_db';

  UserLabel := TNewStaticText.Create(DatabasePage);
  UserLabel.Parent := DatabasePage.Surface;
  UserLabel.Caption := 'Utilisateur PostgreSQL :';
  UserLabel.Left := 0;
  UserLabel.Top := ScaleY(168);

  UserEdit := TNewEdit.Create(DatabasePage);
  UserEdit.Parent := DatabasePage.Surface;
  UserEdit.Left := 0;
  UserEdit.Top := ScaleY(188);
  UserEdit.Width := DatabasePage.SurfaceWidth;
  UserEdit.Text := 'cabinet_app';

  PasswordLabel := TNewStaticText.Create(DatabasePage);
  PasswordLabel.Parent := DatabasePage.Surface;
  PasswordLabel.Caption := 'Mot de passe PostgreSQL :';
  PasswordLabel.Left := 0;
  PasswordLabel.Top := ScaleY(224);

  PasswordEdit := TNewEdit.Create(DatabasePage);
  PasswordEdit.Parent := DatabasePage.Surface;
  PasswordEdit.Left := 0;
  PasswordEdit.Top := ScaleY(244);
  PasswordEdit.Width := DatabasePage.SurfaceWidth;
  PasswordEdit.PasswordChar := '*';
  PasswordEdit.Text := '';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  PortNumber: Integer;
begin
  Result := True;

  if CurPageID = DeploymentPage.ID then
  begin
    if DeploymentPage.SelectedValueIndex = 0 then
      HostEdit.Text := '127.0.0.1'
    else if (Trim(HostEdit.Text) = '127.0.0.1') or (Trim(HostEdit.Text) = 'localhost') then
      HostEdit.Text := '';
  end;

  if CurPageID = DatabasePage.ID then
  begin
    if Trim(HostEdit.Text) = '' then
    begin
      MsgBox('Veuillez saisir l''adresse du serveur PostgreSQL.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    if (DeploymentPage.SelectedValueIndex = 1) and
       ((Trim(HostEdit.Text) = '127.0.0.1') or (Lowercase(Trim(HostEdit.Text)) = 'localhost')) then
    begin
      MsgBox('Sur un PC client, saisissez l''adresse IPv4 du PC serveur PostgreSQL.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    PortNumber := StrToIntDef(Trim(PortEdit.Text), 0);
    if (PortNumber < 1) or (PortNumber > 65535) then
    begin
      MsgBox('Le port PostgreSQL doit être compris entre 1 et 65535.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    if (Trim(DatabaseEdit.Text) = '') or (Trim(UserEdit.Text) = '') or
       (PasswordEdit.Text = '') then
    begin
      MsgBox('Le nom de la base, l''utilisateur et le mot de passe sont obligatoires.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure WriteDatabaseConfiguration;
var
  ConfigDir: String;
  ConfigPath: String;
  ConfigJson: String;
begin
  ConfigDir := ExpandConstant('{userappdata}\physiocare');
  ConfigPath := ConfigDir + '\database-config.json';

  if not ForceDirectories(ConfigDir) then
    RaiseException('Impossible de créer le dossier de configuration : ' + ConfigDir);

  ConfigJson :=
    '{' + #13#10 +
    '  "database": {' + #13#10 +
    '    "mode": "network",' + #13#10 +
    '    "host": "' + JsonEscape(Trim(HostEdit.Text)) + '",' + #13#10 +
    '    "port": ' + IntToStr(StrToInt(Trim(PortEdit.Text))) + ',' + #13#10 +
    '    "database": "' + JsonEscape(Trim(DatabaseEdit.Text)) + '",' + #13#10 +
    '    "user": "' + JsonEscape(Trim(UserEdit.Text)) + '",' + #13#10 +
    '    "password": "' + JsonEscape(PasswordEdit.Text) + '",' + #13#10 +
    '    "ssl": false' + #13#10 +
    '  }' + #13#10 +
    '}' + #13#10;

  if not SaveStringToFile(ConfigPath, ConfigJson, False) then
    RaiseException('Impossible d''écrire la configuration PostgreSQL : ' + ConfigPath);
end;

function TestPostgreSQLConnection: Boolean;
var
  TempConfigPath: String;
  LogPath: String;
  TempJson: String;
  Params: String;
  LogDetails: String;
  LogDetailsAnsi: AnsiString;
  ResultCode: Integer;
begin
  Result := True;
  TempConfigPath := ExpandConstant('{tmp}\medcareso-postgresql-test.json');
  LogPath := ExpandConstant('{tmp}\medcareso-postgresql-test.log');

  TempJson :=
    '{' + #13#10 +
    '  "host": "' + JsonEscape(Trim(HostEdit.Text)) + '",' + #13#10 +
    '  "port": ' + IntToStr(StrToInt(Trim(PortEdit.Text))) + ',' + #13#10 +
    '  "database": "' + JsonEscape(Trim(DatabaseEdit.Text)) + '",' + #13#10 +
    '  "user": "' + JsonEscape(Trim(UserEdit.Text)) + '",' + #13#10 +
    '  "password": "' + JsonEscape(PasswordEdit.Text) + '",' + #13#10 +
    '  "ssl": false' + #13#10 +
    '}' + #13#10;

  if not SaveStringToFile(TempConfigPath, TempJson, False) then
    RaiseException('Impossible de préparer le test PostgreSQL temporaire.');

  DeleteFile(LogPath);

  Params :=
    '--test-database-connection "' + TempConfigPath + '" "' + LogPath + '"';

  if (not Exec(ExpandConstant('{app}\{#MyAppExeName}'), Params, ExpandConstant('{app}'),
      SW_HIDE, ewWaitUntilTerminated, ResultCode)) or (ResultCode <> 0) then
  begin
    Result := False;
    LogDetails := '';
    LogDetailsAnsi := '';
    if LoadStringFromFile(LogPath, LogDetailsAnsi) then
      LogDetails := #13#10 + #13#10 + 'Détail PostgreSQL :' + #13#10 + String(LogDetailsAnsi);
    MsgBox(
      'La connexion à PostgreSQL a échoué. Le logiciel ne sera pas lancé.' + #13#10 + #13#10 +
      'Vérifiez l''adresse du serveur, le port, la base, l''utilisateur, le mot de passe, ' +
      'le pare-feu et pg_hba.conf.' + #13#10 +
      'Journal : ' + LogPath + LogDetails,
      mbError,
      MB_OK
    );
  end;
  DeleteFile(TempConfigPath);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    if not TestPostgreSQLConnection then
      RaiseException('Installation interrompue : la connexion PostgreSQL n''a pas été validée.');
    WriteDatabaseConfiguration;
  end;
end;
