; ERPNext POS — Custom NSIS activation pages
; Inserted via nsis.include in package.json.
; Pages appear in the wizard before the installation progress bar.

!macro customHeader
  !include "nsDialogs.nsh"
  !include "LogicLib.nsh"

  ; ── Variables ──────────────────────────────────────────────────────────────
  Var dlg
  Var RadioActivate
  Var RadioTrial
  Var ActivateChosen
  Var TxtSerial
  Var TxtEmail
  Var TxtPhone
  Var TxtCompany
  Var PendingSerial
  Var PendingEmail
  Var PendingPhone
  Var PendingCompany

  ; ── Page 1: Choose activate or trial ───────────────────────────────────────
  Function ActivationChoicePage
    nsDialogs::Create 1018
    Pop $dlg
    ${If} $dlg == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 30u "How would you like to use ERPNext POS?"
    Pop $0

    ${NSD_CreateRadioButton} 0 38u 100% 14u "  I have a license key — activate now"
    Pop $RadioActivate
    ${NSD_SetState} $RadioActivate ${BST_CHECKED}

    ${NSD_CreateRadioButton} 0 58u 100% 14u "  Start the 30-day free trial  (you can activate any time)"
    Pop $RadioTrial

    nsDialogs::Show
  FunctionEnd

  Function ActivationChoicePageLeave
    ${NSD_GetState} $RadioActivate $ActivateChosen
    ${If} $ActivateChosen == ${BST_UNCHECKED}
      ; Trial — write flag immediately so we don't need the form page
      CreateDirectory "$APPDATA\ERPNext POS"
      FileOpen $0 "$APPDATA\ERPNext POS\pending-activation.txt" w
      FileWrite $0 "trial"
      FileClose $0
    ${EndIf}
  FunctionEnd

  ; ── Page 2: Activation details (skipped when trial chosen) ─────────────────
  Function ActivationFormPage
    ${If} $ActivateChosen == ${BST_UNCHECKED}
      Abort   ; skip this page — trial was selected
    ${EndIf}

    nsDialogs::Create 1018
    Pop $dlg
    ${If} $dlg == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 10u "License Key *"
    Pop $0
    ${NSD_CreateText} 0 12u 100% 13u ""
    Pop $TxtSerial

    ${NSD_CreateLabel} 0 30u 100% 10u "Email Address *"
    Pop $0
    ${NSD_CreateText} 0 42u 100% 13u ""
    Pop $TxtEmail

    ${NSD_CreateLabel} 0 60u 100% 10u "Phone Number *"
    Pop $0
    ${NSD_CreateText} 0 72u 100% 13u ""
    Pop $TxtPhone

    ${NSD_CreateLabel} 0 90u 100% 10u "Company / Business Name (optional)"
    Pop $0
    ${NSD_CreateText} 0 102u 100% 13u ""
    Pop $TxtCompany

    nsDialogs::Show
  FunctionEnd

  Function ActivationFormPageLeave
    ${NSD_GetText} $TxtSerial  $PendingSerial
    ${NSD_GetText} $TxtEmail   $PendingEmail
    ${NSD_GetText} $TxtPhone   $PendingPhone
    ${NSD_GetText} $TxtCompany $PendingCompany

    ${If} $PendingSerial == ""
      MessageBox MB_OK|MB_ICONEXCLAMATION "Please enter your license key."
      Abort
    ${EndIf}
    ${If} $PendingEmail == ""
      MessageBox MB_OK|MB_ICONEXCLAMATION "Please enter your email address."
      Abort
    ${EndIf}
    ${If} $PendingPhone == ""
      MessageBox MB_OK|MB_ICONEXCLAMATION "Please enter your phone number."
      Abort
    ${EndIf}

    CreateDirectory "$APPDATA\ERPNext POS"
    FileOpen $0 "$APPDATA\ERPNext POS\pending-activation.txt" w
    FileWrite $0 "activate$\r$\n"
    FileWrite $0 "$PendingSerial$\r$\n"
    FileWrite $0 "$PendingEmail$\r$\n"
    FileWrite $0 "$PendingPhone$\r$\n"
    FileWrite $0 "$PendingCompany$\r$\n"
    FileClose $0
  FunctionEnd

  ; ── Page declarations (order relative to MUI pages is set by electron-builder)
  Page custom ActivationChoicePage ActivationChoicePageLeave
  Page custom ActivationFormPage   ActivationFormPageLeave
!macroend
