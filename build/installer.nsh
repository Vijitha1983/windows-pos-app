; ERPNext POS — Custom NSIS activation pages
;
; Uses the `customFinishPage` hook from electron-builder's assistedInstaller.nsh.
; This macro is invoked in place of MUI_PAGE_FINISH, so our pages appear directly
; after "Installation Complete" — the natural final step of the wizard.

!macro customFinishPage
  !include "nsDialogs.nsh"
  !include "LogicLib.nsh"

  !ifndef WM_SETTEXT
    !define WM_SETTEXT 0x000C
  !endif

  ; ── Variables ──────────────────────────────────────────────────────────────
  Var dlg
  Var RadioActivate
  Var RadioTrial
  Var ActivateChosen
  Var TxtSerial
  Var TxtEmail
  Var TxtPhoneCC
  Var TxtPhone
  Var TxtCompany
  Var PendingSerial
  Var PendingEmail
  Var PendingPhoneCC
  Var PendingPhone
  Var PendingCompany

  ; ── Page 1: Choose activate or trial ───────────────────────────────────────
  Function ActivationChoicePage
    nsDialogs::Create 1018
    Pop $dlg
    ${If} $dlg == error
      Abort
    ${EndIf}

    !insertmacro MUI_HEADER_TEXT "Activate ERPNext POS" "Choose how you would like to proceed."

    ${NSD_CreateLabel} 0 0 100% 30u "How would you like to use ERPNext POS?"
    Pop $0

    ${NSD_CreateRadioButton} 0 38u 100% 14u "  I have a license key — activate now"
    Pop $RadioActivate
    ${NSD_SetState} $RadioActivate ${BST_CHECKED}

    ${NSD_CreateRadioButton} 0 58u 100% 14u "  Start the 30-day free trial  (you can activate any time)"
    Pop $RadioTrial

    ; Rename "Next >" to "Finish" — this is the last wizard step
    GetDlgItem $0 $HWNDPARENT 1
    SendMessage $0 ${WM_SETTEXT} 0 "STR:Finish"

    nsDialogs::Show
  FunctionEnd

  Function ActivationChoicePageLeave
    ${NSD_GetState} $RadioActivate $ActivateChosen
    ${If} $ActivateChosen == ${BST_UNCHECKED}
      ; Trial — write flag and launch app
      CreateDirectory "$APPDATA\ERPNext POS"
      FileOpen $0 "$APPDATA\ERPNext POS\pending-activation.txt" w
      FileWrite $0 "trial"
      FileClose $0
      Exec `"$INSTDIR\ERPNext POS.exe"`
    ${EndIf}
  FunctionEnd

  ; ── Page 2: Activation details (skipped when trial chosen) ─────────────────
  Function ActivationFormPage
    ${If} $ActivateChosen == ${BST_UNCHECKED}
      Abort   ; skip — trial selected, installer is finishing
    ${EndIf}

    nsDialogs::Create 1018
    Pop $dlg
    ${If} $dlg == error
      Abort
    ${EndIf}

    !insertmacro MUI_HEADER_TEXT "Activation Details" "Enter your license information to activate ERPNext POS."

    ; License Key
    ${NSD_CreateLabel} 0 0 100% 10u "License Key *"
    Pop $0
    ${NSD_CreateText} 0 12u 100% 13u ""
    Pop $TxtSerial

    ; Email
    ${NSD_CreateLabel} 0 30u 100% 10u "Email Address *"
    Pop $0
    ${NSD_CreateText} 0 42u 100% 13u ""
    Pop $TxtEmail

    ; Phone — country code dropdown + number field side by side
    ${NSD_CreateLabel} 0 60u 100% 10u "Phone Number *"
    Pop $0

    ${NSD_CreateComboBox} 0 72u 26% 80u "+94"
    Pop $TxtPhoneCC
    ${NSD_CB_AddString} $TxtPhoneCC "+94"     ; Sri Lanka
    ${NSD_CB_AddString} $TxtPhoneCC "+91"     ; India
    ${NSD_CB_AddString} $TxtPhoneCC "+1"      ; USA / Canada
    ${NSD_CB_AddString} $TxtPhoneCC "+44"     ; UK
    ${NSD_CB_AddString} $TxtPhoneCC "+61"     ; Australia
    ${NSD_CB_AddString} $TxtPhoneCC "+65"     ; Singapore
    ${NSD_CB_AddString} $TxtPhoneCC "+60"     ; Malaysia
    ${NSD_CB_AddString} $TxtPhoneCC "+971"    ; UAE
    ${NSD_CB_AddString} $TxtPhoneCC "+974"    ; Qatar
    ${NSD_CB_AddString} $TxtPhoneCC "+966"    ; Saudi Arabia
    ${NSD_CB_AddString} $TxtPhoneCC "+49"     ; Germany
    ${NSD_CB_AddString} $TxtPhoneCC "+33"     ; France
    ${NSD_CB_AddString} $TxtPhoneCC "+86"     ; China
    ${NSD_CB_AddString} $TxtPhoneCC "+81"     ; Japan
    ${NSD_CB_AddString} $TxtPhoneCC "+82"     ; South Korea
    ${NSD_CB_AddString} $TxtPhoneCC "+63"     ; Philippines
    ${NSD_CB_AddString} $TxtPhoneCC "+880"    ; Bangladesh
    ${NSD_CB_AddString} $TxtPhoneCC "+92"     ; Pakistan
    ${NSD_CB_AddString} $TxtPhoneCC "+977"    ; Nepal
    ${NSD_CB_AddString} $TxtPhoneCC "+7"      ; Russia
    ${NSD_SetText} $TxtPhoneCC "+94"

    ${NSD_CreateText} 28% 72u 72% 13u ""
    Pop $TxtPhone

    ; Company (optional)
    ${NSD_CreateLabel} 0 90u 100% 10u "Company / Business Name (optional)"
    Pop $0
    ${NSD_CreateText} 0 102u 100% 13u ""
    Pop $TxtCompany

    ; Rename "Next >" to "Finish"
    GetDlgItem $0 $HWNDPARENT 1
    SendMessage $0 ${WM_SETTEXT} 0 "STR:Finish"

    nsDialogs::Show
  FunctionEnd

  Function ActivationFormPageLeave
    ${NSD_GetText} $TxtSerial   $PendingSerial
    ${NSD_GetText} $TxtEmail    $PendingEmail
    ${NSD_GetText} $TxtPhoneCC  $PendingPhoneCC
    ${NSD_GetText} $TxtPhone    $PendingPhone
    ${NSD_GetText} $TxtCompany  $PendingCompany

    ${If} $PendingSerial == ""
      MessageBox MB_OK|MB_ICONEXCLAMATION "Please enter your license key."
      Abort
    ${EndIf}
    ${If} $PendingEmail == ""
      MessageBox MB_OK|MB_ICONEXCLAMATION "Please enter your email address."
      Abort
    ${EndIf}
    ${If} $PendingPhoneCC == ""
      MessageBox MB_OK|MB_ICONEXCLAMATION "Please select a country code."
      Abort
    ${EndIf}
    ${If} $PendingPhone == ""
      MessageBox MB_OK|MB_ICONEXCLAMATION "Please enter your phone number."
      Abort
    ${EndIf}

    ; Combine country code + number into one phone string
    StrCpy $PendingPhone "$PendingPhoneCC$PendingPhone"

    CreateDirectory "$APPDATA\ERPNext POS"
    FileOpen $0 "$APPDATA\ERPNext POS\pending-activation.txt" w
    FileWrite $0 "activate$\r$\n"
    FileWrite $0 "$PendingSerial$\r$\n"
    FileWrite $0 "$PendingEmail$\r$\n"
    FileWrite $0 "$PendingPhone$\r$\n"
    FileWrite $0 "$PendingCompany$\r$\n"
    FileClose $0
    Exec `"$INSTDIR\ERPNext POS.exe"`
  FunctionEnd

  ; ── Page declarations ────────────────────────────────────────────────────────
  Page custom ActivationChoicePage ActivationChoicePageLeave
  Page custom ActivationFormPage   ActivationFormPageLeave
!macroend
