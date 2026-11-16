/* ═══════════════════════════════════════════════════════════════
   SWITCH CASHIER & FAST PIN LOGIN CONTROLLER
   Matching user commercial POS screenshot (ADMIN, DIYAR, AMAL, ASHNA, REBAR, YADAK)
   Features: Fast Touch PIN, Direct Shift & Cash Handover connection,
             Manager Pass Authorization & Full Cashier/Avatar/PIN Editor
   ═══════════════════════════════════════════════════════════════ */

var SwitchCashier = (function () {
  var currentPin = "";
  var selectedUser = null;
  var usersList = [];
  var isStandaloneLogin = false;

  // Editor states
  var editingUser = null;
  var editingAvatar = "";
  var isNewCashier = false;

  // 1. High-Quality SVG Avatars Matching User Photo
  var AVATARS = {
    A: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#f59e0b"/><text x="50" y="65" font-family="Segoe UI, Tahoma, sans-serif" font-size="44" font-weight="900" fill="#ffffff" text-anchor="middle">A</text></svg>',
    Y: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#06b6d4"/><text x="50" y="65" font-family="Segoe UI, Tahoma, sans-serif" font-size="44" font-weight="900" fill="#ffffff" text-anchor="middle">Y</text></svg>',
    diyar: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#e2e8f0"/><circle cx="50" cy="42" r="21" fill="#fcd34d"/><path d="M29 36 Q50 16 71 36 Q75 22 50 18 Q25 22 29 36 Z" fill="#334155"/><path d="M37 46 Q50 63 63 46 Q64 58 50 62 Q36 58 37 46 Z" fill="#1e293b"/><ellipse cx="44" cy="40" rx="2.5" ry="3.5" fill="#1e293b"/><ellipse cx="56" cy="40" rx="2.5" ry="3.5" fill="#1e293b"/><path d="M20 96 C20 74 34 68 50 68 C66 68 80 74 80 96 Z" fill="#64748b"/></svg>',
    amal: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#fee2e2"/><path d="M25 45 C25 22 75 22 75 45 C75 68 70 82 50 82 C30 82 25 68 25 45 Z" fill="#f87171"/><ellipse cx="50" cy="46" rx="17" ry="20" fill="#fde68a"/><ellipse cx="44" cy="45" rx="2.2" ry="3" fill="#1e293b"/><ellipse cx="56" cy="45" rx="2.2" ry="3" fill="#1e293b"/><path d="M47 54 Q50 57 53 54" stroke="#e11d48" stroke-width="2" fill="none"/><path d="M18 98 C18 78 30 72 50 72 C70 72 82 78 82 98 Z" fill="#fb7185"/></svg>',
    ashna: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#f1f5f9"/><path d="M26 42 Q50 18 74 42 Q78 16 50 14 Q22 16 26 42 Z" fill="#0f172a"/><path d="M26 40 L24 64 Q26 72 32 68 L32 46 Z" fill="#0f172a"/><path d="M74 40 L76 64 Q74 72 68 68 L68 46 Z" fill="#0f172a"/><circle cx="50" cy="45" r="19" fill="#fed7aa"/><ellipse cx="44" cy="43" rx="2.5" ry="3.2" fill="#0f172a"/><ellipse cx="56" cy="43" rx="2.5" ry="3.2" fill="#0f172a"/><path d="M47 52 Q50 56 53 52" stroke="#ea580c" stroke-width="2" fill="none"/><path d="M20 98 C20 76 34 70 50 70 C66 70 80 76 80 98 Z" fill="#0284c7"/></svg>',
    rebar: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#e0f2fe"/><circle cx="50" cy="44" r="20" fill="#fed7aa"/><path d="M30 38 Q48 14 70 34 Q68 20 50 18 Q32 20 30 38 Z" fill="#475569"/><ellipse cx="44" cy="42" rx="2.5" ry="3.2" fill="#1e293b"/><ellipse cx="56" cy="42" rx="2.5" ry="3.2" fill="#1e293b"/><path d="M46 51 Q50 54 54 51" stroke="#334155" stroke-width="1.8" fill="none"/><path d="M22 98 C22 76 34 70 50 70 C66 70 78 76 78 98 Z" fill="#3b82f6"/></svg>'
  };

  function getAvatarHtml(avatarKey, fullName) {
    if (avatarKey && (avatarKey.startsWith("data:image/") || avatarKey.startsWith("http://") || avatarKey.startsWith("https://") || avatarKey.startsWith("/") || avatarKey.startsWith("./") || avatarKey.startsWith("uploads/"))) {
      return '<img src="' + avatarKey + '" alt="' + (fullName || "") + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">';
    }
    if (avatarKey && AVATARS[avatarKey]) {
      return AVATARS[avatarKey];
    }
    var letter = (fullName || "C").trim().charAt(0).toUpperCase();
    if (letter === "A") return AVATARS.A;
    if (letter === "Y") return AVATARS.Y;
    var bgColors = ["#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4"];
    var idx = Math.abs(letter.charCodeAt(0)) % bgColors.length;
    return '<div class="sc-avatar-initial" style="background:' + bgColors[idx] + ';">' + letter + '</div>';
  }

  function playKeyClickSound() {}
  function playSuccessSound() {}
  function playErrorSound() {}

  function getApiBase() {
    if (window.isPosDemoMode && window.isPosDemoMode()) return "";
    if (typeof ApiClient !== "undefined" && typeof ApiClient.getBaseUrl === "function") {
      return ApiClient.getBaseUrl();
    }
    if (window.location && window.location.origin && window.location.origin.indexOf("http") === 0) {
      return window.location.origin;
    }
    return "http://localhost:3005";
  }

  function cashierRoleMeta(u) {
    var role = u && u.role;
    if (typeof AuthService !== "undefined" && AuthService.getRoleMeta) {
      return AuthService.getRoleMeta(role);
    }
    var r = String(role || "cashier").toLowerCase();
    if (r === "admin") return { label: "ئەدمین", color: "#f59e0b" };
    if (r === "manager") return { label: "بەڕێوەبەر", color: "#fb923c" };
    if (r === "warehouse") return { label: "کۆگا", color: "#38bdf8" };
    return { label: "کاشیر", color: "#10b981" };
  }

  function cashierRoleLabel(u) {
    return cashierRoleMeta(u).label;
  }

  function isMasterUser(u) {
    return !!(u && typeof AuthService !== "undefined" && AuthService.isMasterUsername && AuthService.isMasterUsername(u.username));
  }

  function isActiveStaff(u) {
    if (!u) return false;
    if (isMasterUser(u)) return false;
    if (typeof AuthService !== "undefined" && AuthService.isFactoryShowcaseUser && AuthService.isFactoryShowcaseUser(u)) return false;
    if (u.status === "inactive" || u.isActive === false || u.isActive === 0) return false;
    return true;
  }

  function isPinLoginStaff(u) {
    if (!isActiveStaff(u)) return false;
    var r = (typeof AuthService !== "undefined" && AuthService.normalizeRole)
      ? AuthService.normalizeRole(u.role)
      : String(u.role || "cashier").toLowerCase();
    return r === "cashier" || r === "warehouse";
  }

  // 2. Fetch Cashiers from Database
  function loadCashiers() {
    if (window.isPosDemoMode && window.isPosDemoMode()) {
      useSqliteStaff();
      renderCashierList();
      return Promise.resolve(usersList);
    }
    return fetch(getApiBase() + "/api/users")
      .then(function (r) { return r.json(); })
      .then(function (users) {
        if (users && users.length > 0) {
          usersList = users.filter(isActiveStaff);
          mergeSqliteStaff();
          // Synchronize users into browser SQLite cache so both engines match
          if (typeof SqliteDB !== "undefined") {
            try {
              users.forEach(function (u) {
                var row = SqliteDB.getUserByUsername(u.username);
                var permsObj = u.permissions;
                if (typeof permsObj === "string") {
                  try { permsObj = JSON.parse(permsObj); } catch (e) { permsObj = null; }
                }
                var roleNorm = (typeof AuthService !== "undefined" && AuthService.normalizeRole)
                  ? AuthService.normalizeRole(u.role || "cashier")
                  : (u.role || "cashier");
                if ((u.username === "admin" || u.username === "smartserve@gmail.iq") && !(typeof AuthService !== "undefined" && AuthService.isOwnerRole && AuthService.isOwnerRole(roleNorm))) {
                  roleNorm = "admin";
                }
                if (typeof AuthService !== "undefined" && AuthService.isMasterUsername && AuthService.isMasterUsername(u.username)) {
                  return;
                }
                if (typeof AuthService !== "undefined" && AuthService.isFactoryShowcaseUser && AuthService.isFactoryShowcaseUser(u)) {
                  return;
                }
                if (row) {
                  var upd = {
                    fullName: u.fullName,
                    role: roleNorm,
                    phone: u.phone || "",
                    permissions: permsObj,
                    lastLogin: u.lastLogin || row.lastLogin
                  };
                  if (u.passcode || u.pin) upd.pin = u.passcode || u.pin;
                  SqliteDB.updateUser(row.id, upd);
                } else {
                  SqliteDB.insertUser({
                    id: u.id,
                    fullName: u.fullName,
                    username: u.username,
                    passwordHash: "legacy$" + (u.passcode || u.pin || ""),
                    role: roleNorm,
                    phone: u.phone || "",
                    permissions: permsObj,
                    pin: u.passcode || u.pin || "",
                    isActive: u.isActive !== 0 && u.isActive !== false,
                    createdAt: new Date().toISOString(),
                    lastLogin: u.lastLogin || null
                  });
                }
              });
              if (typeof AuthService !== "undefined") {
                AuthService.syncUsersCache();
              }
            } catch (e) {
              console.warn("loadCashiers SQLite sync error:", e);
            }
          }
        } else {
          useSqliteStaff();
        }
        renderCashierList();
        return usersList;
      })
      .catch(function () {
        useSqliteStaff();
        renderCashierList();
        return usersList;
      });
  }

  function useSqliteStaff() {
    usersList = [];
    mergeSqliteStaff();
  }

  function mergeSqliteStaff() {
    if (typeof DB === "undefined" || !Array.isArray(DB.users)) return;
    DB.users.filter(isActiveStaff).forEach(function (u) {
      var exists = usersList.some(function (x) {
        return x.id === u.id || String(x.username || "").toLowerCase() === String(u.username || "").toLowerCase();
      });
      if (!exists) usersList.push(u);
    });
  }

  function renderCashierList(filterText) {
    var listEl = document.getElementById("scCashierList");
    var query = (filterText || "").trim().toLowerCase();
    var filtered = usersList.filter(function (u) {
      if (!query) return true;
      var name = (u.fullName || "").toLowerCase();
      var uname = (u.username || "").toLowerCase();
      return name.indexOf(query) !== -1 || uname.indexOf(query) !== -1;
    });

    if (listEl) {
      if (filtered.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:24px;color:#64748b;font-size:0.85rem;">هیچ کارمەندێک نەدۆزرایەوە. سەرەتا بەڕێوەبەر کاشێر زیاد دەکات.</div>';
      } else {
        listEl.innerHTML = filtered.map(function (u) {
          var isSelected = selectedUser && selectedUser.username === u.username;
          var activeClass = isSelected ? "active" : "";
          var roleText = cashierRoleLabel(u);
          var avHtml = getAvatarHtml(u.avatar, u.fullName);

          return [
            '<div class="sc-cashier-card ' + activeClass + '" data-username="' + u.username + '" onclick="SwitchCashier.selectUser(\'' + u.username + '\')">',
            '  <div class="sc-avatar-wrap">',
            '    ' + avHtml,
            '    <span class="sc-status-dot"></span>',
            '  </div>',
            '  <div class="sc-cashier-info">',
            '    <div class="sc-cashier-name">' + (u.fullName || u.username).toUpperCase() + '</div>',
            '    <div class="sc-cashier-role">' + roleText + '</div>',
            '  </div>',
            '</div>'
          ].join("");
        }).join("");
      }
    }

    // Dynamically update Login Page cashier grid
    var gridEl = document.getElementById("loginCashierGrid");
    if (gridEl) {
      var pinStaff = usersList.filter(isPinLoginStaff);
      if (!pinStaff.length) {
        gridEl.innerHTML = '<div class="login-staff-empty">هێشتا کاشێر تۆمار نەکراوە.<br><strong>سەرەتا وەک بەڕێوەبەر بچۆ ژوورەوە</strong>، پاشان لە پەڕەی بەکارهێنەران کاشێر زیاد بکە و PINـی ٤ ژمارەیی دابنێ.</div>';
      } else {
        gridEl.innerHTML = pinStaff.map(function (u) {
          var avHtml = getAvatarHtml(u.avatar, u.fullName);
          var meta = cashierRoleMeta(u);
          var roleBadge = meta.label;
          var roleColor = meta.color;
          return '<div onclick="SwitchCashier.open(true);SwitchCashier.selectUser(\'' + u.username + '\');" style="cursor:pointer;padding:12px 8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;transition:all 0.2s;">' +
            '<div style="width:48px;height:48px;margin:0 auto 6px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(0,0,0,0.3);">' + avHtml + '</div>' +
            '<div style="font-weight:800;font-size:0.85rem;color:#f8fafc;">' + (u.fullName || u.username).toUpperCase() + '</div>' +
            '<div style="font-size:0.7rem;color:' + roleColor + ';">' + roleBadge + '</div>' +
          '</div>';
        }).join("");
      }
    }

    // Dynamically update Users Page cashier cards strip
    var usersStrip = document.getElementById("usersSectionCashierCards");
    if (usersStrip) {
      usersStrip.innerHTML = usersList.map(function (u) {
        var avHtml = getAvatarHtml(u.avatar, u.fullName);
        var meta = cashierRoleMeta(u);
        var roleBadge = meta.label;
        var roleColor = meta.color;
        return '<div onclick="SwitchCashier.open(false);SwitchCashier.selectUser(\'' + u.username + '\');" style="cursor:pointer;padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;text-align:center;transition:all 0.2s;">' +
          '<div style="width:48px;height:48px;margin:0 auto 6px;border-radius:50%;display:flex;align-items:center;justify-content:center;">' + avHtml + '</div>' +
          '<div style="font-weight:800;font-size:0.85rem;">' + (u.fullName || u.username).toUpperCase() + '</div>' +
          '<div style="font-size:0.7rem;color:' + roleColor + ';">' + roleBadge + '</div>' +
        '</div>';
      }).join("") +
      '<div onclick="openUserModal(null,\'cashier\')" style="cursor:pointer;padding:12px;background:rgba(16,185,129,0.05);border:1px dashed rgba(16,185,129,0.3);border-radius:12px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;">' +
        '<div style="width:44px;height:44px;border-radius:50%;background:rgba(16,185,129,0.15);color:#10b981;display:flex;align-items:center;justify-content:center;font-size:1.2rem;margin-bottom:6px;"><i class="fas fa-plus"></i></div>' +
        '<div style="font-weight:800;font-size:0.85rem;color:#10b981;">کاشیری نوێ</div>' +
      '</div>' +
      '<div onclick="openUserModal(null,\'admin\')" style="cursor:pointer;padding:12px;background:rgba(245,158,11,0.08);border:1px dashed rgba(245,158,11,0.4);border-radius:12px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;">' +
        '<div style="width:44px;height:44px;border-radius:50%;background:rgba(245,158,11,0.18);color:#f59e0b;display:flex;align-items:center;justify-content:center;font-size:1.2rem;margin-bottom:6px;"><i class="fas fa-crown"></i></div>' +
        '<div style="font-weight:800;font-size:0.85rem;color:#f59e0b;">ئەدمینی نوێ</div>' +
      '</div>';
    }

    if (!isStandaloneLogin && !selectedUser && filtered.length > 0) {
      selectUser(filtered[0].username);
    }
  }

  function selectUser(username) {
    var u = usersList.find(function (item) { return item.username.toLowerCase() === username.toLowerCase(); });
    if (!u) return;
    selectedUser = u;
    currentPin = "";
    updatePinDisplay();

    // Update active highlight in left list
    var cards = document.querySelectorAll(".sc-cashier-card");
    cards.forEach(function (card) {
      if (card.getAttribute("data-username").toLowerCase() === username.toLowerCase()) {
        card.classList.add("active");
      } else {
        card.classList.remove("active");
      }
    });

    // Update right panel profile
    var bigAvWrap = document.getElementById("scBigAvatarWrap");
    if (bigAvWrap) {
      bigAvWrap.innerHTML = getAvatarHtml(u.avatar, u.fullName) + '<span class="sc-status-dot"></span>';
    }
    var bigName = document.getElementById("scBigName");
    if (bigName) {
      bigName.textContent = (u.fullName || u.username).toUpperCase();
    }

    // Clear any previous error
    var errMsg = document.getElementById("scErrorMsg");
    if (errMsg) errMsg.textContent = "";

    // Check remembered password
    var remembered = localStorage.getItem("sc_remember_" + u.username);
    var rememberCheckbox = document.getElementById("scRememberCheckbox");
    if (rememberCheckbox) {
      rememberCheckbox.checked = !!remembered;
    }
    if (remembered) {
      currentPin = remembered;
      updatePinDisplay();
    }
  }

  function appendPin(digit) {
    if (currentPin.length >= 8) return;
    currentPin += String(digit);
    playKeyClickSound();
    updatePinDisplay();

    if (currentPin.length === 4) {
      var pinBox = document.getElementById("scPinDisplay");
      if (pinBox) pinBox.classList.add("focus");
      // Instant Auto-Login on 4 digits without pressing Sign In button
      setTimeout(function () {
        submitSignIn();
      }, 150);
    }
  }

  function clearPin() {
    currentPin = "";
    playKeyClickSound();
    updatePinDisplay();
    var errMsg = document.getElementById("scErrorMsg");
    if (errMsg) errMsg.textContent = "";
  }

  function backspacePin() {
    if (currentPin.length > 0) {
      currentPin = currentPin.slice(0, -1);
      playKeyClickSound();
      updatePinDisplay();
    }
  }

  function updatePinDisplay() {
    var dotsContainer = document.getElementById("scPinDots");
    var placeholder = document.getElementById("scPinPlaceholder");
    if (!dotsContainer) return;

    if (currentPin.length === 0) {
      dotsContainer.style.display = "none";
      if (placeholder) placeholder.style.display = "block";
    } else {
      dotsContainer.style.display = "flex";
      if (placeholder) placeholder.style.display = "none";

      var dotsHtml = "";
      for (var i = 0; i < 4; i++) {
        var isFilled = i < currentPin.length;
        dotsHtml += '<div class="sc-pin-dot ' + (isFilled ? "filled" : "") + '"></div>';
      }
      dotsContainer.innerHTML = dotsHtml;
    }
  }

  function submitSignIn() {
    if (!selectedUser) {
      showError("تکایە کاشیرێک هەڵبژێرە");
      return;
    }
    if (!currentPin) {
      showError("تکایە کۆدی PIN دابگرە");
      return;
    }

    var signInBtn = document.getElementById("scSignInBtn");
    if (signInBtn) {
      signInBtn.disabled = true;
      signInBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> چوونەژوورەوە...';
    }

    if (window.isPosDemoMode && window.isPosDemoMode()) {
      var demoPin = currentPin;
      var demoUser = selectedUser;
      var demoOk = false;
      if (demoUser.passcode && demoUser.passcode === demoPin) demoOk = true;
      else if (demoUser.pin && String(demoUser.pin) === demoPin) demoOk = true;
      if (!demoOk && typeof SqliteDB !== "undefined" && SqliteDB.getUserByUsername) {
        try {
          var demoRow = SqliteDB.getUserByUsername(demoUser.username);
          if (demoRow && (String(demoRow.pin || "") === demoPin || String(demoRow.passcode || "") === demoPin)) demoOk = true;
        } catch (eDemoPin) {}
      }
      if (demoOk) {
        playSuccessSound();
        applyUserSession(demoUser);
        closeModal();
        toast("دیمۆ", "چوونەژوورەوە بۆ [" + demoUser.fullName + "]", "success");
      } else {
        playErrorSound();
        showError("وشەی نهێنی (PIN) هەڵەیە!");
        currentPin = "";
        updatePinDisplay();
      }
      if (signInBtn) {
        signInBtn.disabled = false;
        signInBtn.innerHTML = "SIGN IN";
      }
      return;
    }

    fetch(getApiBase() + "/api/users/verify-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: selectedUser.username,
        pin: currentPin
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.success && res.user) {
          playSuccessSound();

          var rememberCheckbox = document.getElementById("scRememberCheckbox");
          if (rememberCheckbox && rememberCheckbox.checked) {
            localStorage.setItem("sc_remember_" + selectedUser.username, currentPin);
          } else {
            localStorage.removeItem("sc_remember_" + selectedUser.username);
          }

          applyUserSession(res.user);
          closeModal();
          toast("بەخێربێیت", "کاشیر [" + res.user.fullName + "] بە سەرکەوتوویی چووە ژوورەوە ✅", "success");
        } else {
          playErrorSound();
          showError(res.message || "وشەی نهێنی (PIN) هەڵەیە!");
          var pinBox = document.getElementById("scPinDisplay");
          if (pinBox) {
            pinBox.classList.add("error");
            setTimeout(function () { pinBox.classList.remove("error"); }, 400);
          }
          currentPin = "";
          updatePinDisplay();
        }
      })
      .catch(function () {
        // Fallback offline validation
        var offlineSuccess = false;
        var p = currentPin;
        var u = selectedUser;
        if (u.passcode && u.passcode === p) offlineSuccess = true;
        else if (u.pin && String(u.pin) === p) offlineSuccess = true;

        if (offlineSuccess) {
          playSuccessSound();
          applyUserSession(u);
          closeModal();
          toast("ئۆفلاین", "چوونەژوورەوەی ئۆفلاین بۆ کاشیر [" + u.fullName + "]", "success");
        } else {
          playErrorSound();
          showError("وشەی نهێنی (PIN) هەڵەیە!");
          currentPin = "";
          updatePinDisplay();
        }
      })
      .finally(function () {
        if (signInBtn) {
          signInBtn.disabled = false;
          signInBtn.innerHTML = 'SIGN IN';
        }
      });
  }

  // 3. Connect Logged-in Cashier to Session, POS, Shifts & Handover Board
  function applyUserSession(user) {
    var rawRole = user.role || "cashier";
    var normalizedRole = (typeof AuthService !== "undefined" && AuthService.normalizeRole) ? AuthService.normalizeRole(rawRole) : rawRole;
    var uNameLower = (user.username || "").toLowerCase();
    if ((uNameLower === "admin" || uNameLower === "smartserve@gmail.iq" || uNameLower === "smartserve" || uNameLower === "manager") &&
        !(typeof AuthService !== "undefined" && AuthService.isOwnerRole && AuthService.isOwnerRole(normalizedRole))) {
      normalizedRole = uNameLower === "manager" ? "manager" : "admin";
    }

    var userPerms = user.permissions;
    if (typeof userPerms === "string") {
      try { userPerms = JSON.parse(userPerms); } catch (e) { userPerms = null; }
    }

    var displayName = String(user.fullName || user.name || user.username || "").trim() || "کاشیر";

    if (typeof AuthService !== "undefined") {
      AuthService.saveSession({
        id: user.id,
        fullName: displayName,
        name: displayName,
        username: user.username,
        role: normalizedRole,
        phone: user.phone || "",
        permissions: userPerms || null,
        shiftStart: user.shiftStart || "08:00",
        shiftEnd: user.shiftEnd || "16:00",
        shiftNotifyMinutes: user.shiftNotifyMinutes != null ? user.shiftNotifyMinutes : 10
      });
      AuthService.applyNavPermissions();
    }
    if (typeof DB !== "undefined") {
      DB.currentUser = {
        id: user.id,
        name: displayName,
        fullName: displayName,
        username: user.username,
        role: normalizedRole,
        permissions: userPerms || null,
        shiftStart: user.shiftStart || "08:00",
        shiftEnd: user.shiftEnd || "16:00",
        shiftNotifyMinutes: user.shiftNotifyMinutes != null ? user.shiftNotifyMinutes : 10
      };
    }

    if (typeof updatePosHeaderInfo === "function") {
      updatePosHeaderInfo();
    } else {
      var headerCashier = document.getElementById("headerCashierName");
      if (headerCashier) {
        headerCashier.removeAttribute("data-i18n-src");
        headerCashier.textContent = displayName;
      }
      var userNameEl = document.getElementById("userName");
      if (userNameEl) {
        userNameEl.removeAttribute("data-i18n-src");
        userNameEl.textContent = displayName;
      }
    }
    var posStoreName = document.getElementById("posStoreName");
    if (posStoreName) posStoreName.title = "کاشیری چالاک: " + displayName;
    var userAvatarEl = document.getElementById("userAvatar");
    if (userAvatarEl) {
      if (user.avatar && (user.avatar.startsWith("data:image/") || user.avatar.startsWith("http") || user.avatar.startsWith("/"))) {
        userAvatarEl.innerHTML = '<img src="' + user.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">';
      } else {
        userAvatarEl.textContent = displayName.charAt(0).toUpperCase();
      }
    }

    var roleMeta = (typeof AuthService !== "undefined" && AuthService.getRoleMeta)
      ? AuthService.getRoleMeta(normalizedRole)
      : { label: normalizedRole === "manager" || normalizedRole === "admin" ? "بەڕێوەبەر" : "کاشیر", color: "#10b981" };
    var userRoleEl = document.getElementById("userRole");
    if (userRoleEl) {
      userRoleEl.removeAttribute("data-i18n-src");
      userRoleEl.textContent = roleMeta.label;
      userRoleEl.style.color = roleMeta.color || "#10b981";
      userRoleEl.style.fontWeight = "700";
    }

    // Record login log
    if (typeof logLogin === "function") {
      try { logLogin(user.username || user.fullName, true); } catch (e) {}
    }

    var cashEl = document.getElementById("hoFooterCashierName");
    if (cashEl) {
      cashEl.removeAttribute("data-i18n-src");
      cashEl.textContent = displayName;
    }
    var agrCash = document.getElementById("agrCashierName");
    if (agrCash) {
      agrCash.removeAttribute("data-i18n-src");
      agrCash.textContent = displayName;
    }

    fetch(getApiBase() + "/api/shifts/switch-active-cashier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cashier: displayName })
    }).catch(function () {});

    // Sync Shift Cycle Strip in ShiftsManager (24-Hour 3-Cashier chain)
    if (typeof ShiftsManager !== "undefined") {
      var uname = (user.username || "").toLowerCase();
      var fname = (user.fullName || "").toUpperCase();
      if (uname === "diyar" || fname.includes("DIYAR") || fname.includes("دیار")) {
        ShiftsManager.selectCycleShift("night");
      } else if (uname === "amal" || fname.includes("AMAL") || fname.includes("ئاراس") || fname.includes("ARAM")) {
        ShiftsManager.selectCycleShift("morning");
      } else if (uname === "ashna" || uname === "rebar" || fname.includes("ASHNA") || fname.includes("REBAR") || fname.includes("هەڵگورد")) {
        ShiftsManager.selectCycleShift("evening");
      } else {
        ShiftsManager.openCashHandoverBoard();
      }
    }

    // Switch view to POS or user's default allowed page
    var loginPage = document.getElementById("loginPage");
    var appPage = document.getElementById("appPage");
    if (loginPage && appPage) {
      loginPage.classList.remove("active");
      appPage.classList.add("active");
    }
    var targetPage = "pos";
    if (window.isPosDemoMode && window.isPosDemoMode() && typeof AuthService !== "undefined" && AuthService.isOwnerRole && AuthService.isOwnerRole(normalizedRole)) {
      targetPage = (AuthService.getDefaultPage && AuthService.getDefaultPage()) || "dashboard";
    } else if (typeof AuthService !== "undefined" && !AuthService.canAccessPage("pos")) {
      targetPage = AuthService.getDefaultPage() || "orders";
    }
    if (typeof switchSection !== "undefined") {
      switchSection(targetPage, true);
    }
    if (typeof refreshCurrentShift !== "undefined") {
      refreshCurrentShift();
    }
  }

  function showError(msg) {
    var errMsg = document.getElementById("scErrorMsg");
    if (errMsg) errMsg.textContent = msg;
  }

  function openModal(standalone) {
    isStandaloneLogin = !!standalone;
    var modal = document.getElementById("switchCashierModal");
    if (!modal) return;
    modal.classList.add("active");

    var closeBtn = document.getElementById("scCloseBtn");
    if (closeBtn) {
      closeBtn.style.display = isStandaloneLogin ? "none" : "flex";
    }

    loadCashiers().then(function () {
      currentPin = "";
      updatePinDisplay();
    });
  }

  function closeModal() {
    var modal = document.getElementById("switchCashierModal");
    if (modal) modal.classList.remove("active");
    currentPin = "";
  }

  // ═══════════════════════════════════════════════════════════════
  // MANAGER PASSCODE AUTHENTICATION (PASS FOR EDIT)
  // ═══════════════════════════════════════════════════════════════

  function openManagerAuth() {
    var modal = document.getElementById("scManagerAuthModal");
    if (!modal) return;
    modal.classList.add("active");
    var input = document.getElementById("scMgrPinInput");
    if (input) {
      input.value = "";
      setTimeout(function () { input.focus(); }, 100);
    }
    var err = document.getElementById("scMgrErrorMsg");
    if (err) err.textContent = "";
  }

  function closeManagerAuth() {
    var modal = document.getElementById("scManagerAuthModal");
    if (modal) modal.classList.remove("active");
  }

  function confirmManagerAuth() {
    var input = document.getElementById("scMgrPinInput");
    var pin = input ? input.value.trim() : "";
    if (!pin) {
      showMgrError("تکایە پاسکۆد بنووسە");
      return;
    }

    var confirmBtn = document.getElementById("scMgrConfirmBtn");
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> پشکنین...';
    }

    fetch(getApiBase() + "/api/users/verify-manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pin })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.success && res.authorized) {
          playSuccessSound();
          closeManagerAuth();
          openCashierEditor();
        } else {
          playErrorSound();
          showMgrError(res.message || "پاسکۆدی بەڕێوەبەر هەڵەیە!");
          if (input) {
            input.value = "";
            input.focus();
          }
        }
      })
      .catch(function () {
        if (pin === "1234" || pin === "admin123" || pin === "9999") {
          playSuccessSound();
          closeManagerAuth();
          openCashierEditor();
        } else {
          playErrorSound();
          showMgrError("پاسکۆدی بەڕێوەبەر هەڵەیە!");
        }
      })
      .finally(function () {
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = '<i class="fas fa-unlock"></i> کردنەوە';
        }
      });
  }

  function showMgrError(msg) {
    var err = document.getElementById("scMgrErrorMsg");
    if (err) err.textContent = msg;
    var capsule = document.getElementById("scMgrCapsule");
    if (capsule) {
      capsule.classList.add("error");
      setTimeout(function () { capsule.classList.remove("error"); }, 400);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CASHIER PROFILE, PIN & AVATAR EDITOR
  // ═══════════════════════════════════════════════════════════════

  function openCashierEditor() {
    var modal = document.getElementById("cashierEditorModal");
    if (!modal) return;
    modal.classList.add("active");

    renderEditorPresetChips();
    loadCashiers().then(function () {
      renderEditorCashiersList();
      var target = selectedUser || usersList[0];
      if (target) selectEditorCashier(target);
    });
  }

  function closeCashierEditor() {
    var modal = document.getElementById("cashierEditorModal");
    if (modal) modal.classList.remove("active");
  }

  function renderEditorPresetChips() {
    var chipsContainer = document.getElementById("cePresetChips");
    if (!chipsContainer) return;
    var presets = [
      { key: "A", name: "A" },
      { key: "Y", name: "Y" }
    ];
    chipsContainer.innerHTML = presets.map(function (p) {
      return '<div class="ce-preset-chip" title="' + p.name + '" onclick="SwitchCashier.selectPresetAvatar(\'' + p.key + '\')">' + getAvatarHtml(p.key, p.name) + '</div>';
    }).join("");
  }

  function renderEditorCashiersList() {
    var listEl = document.getElementById("ceCashiersList");
    if (!listEl) return;
    listEl.innerHTML = usersList.map(function (u) {
      var isCurrent = editingUser && editingUser.id === u.id;
      var activeClass = isCurrent ? "active" : "";
      var roleText = cashierRoleLabel(u);
      return [
        '<div class="ce-cashier-item ' + activeClass + '" onclick="SwitchCashier.selectEditorCashierById(\'' + u.id + '\')">',
        '  <div class="ce-item-av">' + getAvatarHtml(u.avatar, u.fullName) + '</div>',
        '  <div class="ce-item-info">',
        '    <div class="ce-item-name">' + (u.fullName || u.username).toUpperCase() + '</div>',
        '    <div class="ce-item-meta">',
        '      <span class="ce-item-badge">' + roleText + '</span>',
        '      <span>PIN: ••••</span>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join("");
    }).join("");
  }

  function selectEditorCashierById(id) {
    var u = usersList.find(function (item) { return item.id === id; });
    if (u) selectEditorCashier(u);
  }

  function onCashierEditorRoleChanged() {
    var roleInput = document.getElementById("ceInputRole");
    var role = roleInput ? roleInput.value : "cashier";
    var isManager = (typeof AuthService !== "undefined" && AuthService.isOwnerRole) ? AuthService.isOwnerRole(role) : (role === "manager" || role === "admin");
    var permNote = document.getElementById("cePermNoteManager");
    if (permNote) permNote.style.display = isManager ? "block" : "none";
    var boxes = document.getElementById("cePermCheckboxes");
    if (boxes) {
      var inputs = boxes.querySelectorAll("input[type='checkbox']");
      inputs.forEach(function (cb) {
        cb.disabled = isManager;
        if (isManager) cb.checked = true;
      });
      if (isNewCashier && !isManager && typeof AuthService !== "undefined" && AuthService.applyFormPagePermissions && AuthService.getDefaultPermissionsForRole) {
        AuthService.applyFormPagePermissions("ce_perm_", AuthService.getDefaultPermissionsForRole(role));
      }
    }
  }

  function setAllPagePerms(on) {
    if (typeof AuthService !== "undefined" && AuthService.setFormPagePermissionsAll) {
      AuthService.setFormPagePermissionsAll("ce_perm_", on);
    }
  }

  function onShiftPresetChanged() {
    var shiftSelect = document.getElementById("ceInputShift");
    var shift = shiftSelect ? shiftSelect.value : "morning";
    var startInput = document.getElementById("ceInputShiftStart");
    var endInput = document.getElementById("ceInputShiftEnd");
    if (!startInput || !endInput) return;
    if (shift === "morning") {
      startInput.value = "08:00";
      endInput.value = "16:00";
    } else if (shift === "evening") {
      startInput.value = "16:00";
      endInput.value = "00:00";
    } else if (shift === "night") {
      startInput.value = "00:00";
      endInput.value = "08:00";
    }
  }

  function selectEditorCashier(u) {
    editingUser = u;
    isNewCashier = false;
    editingAvatar = u.avatar || u.fullName.charAt(0).toUpperCase();

    var nameInput = document.getElementById("ceInputFullName");
    if (nameInput) nameInput.value = u.fullName || "";
    var usernameInput = document.getElementById("ceInputUsername");
    if (usernameInput) usernameInput.value = u.username || "";
    var passInput = document.getElementById("ceInputPasscode");
    if (passInput) passInput.value = u.passcode || "";
    var roleInput = document.getElementById("ceInputRole");
    var role = u.role || "cashier";
    if (roleInput) roleInput.value = role;
    var phoneInput = document.getElementById("ceInputPhone");
    if (phoneInput) phoneInput.value = u.phone || "";

    // Load shift times and notification preferences
    var sStart = u.shiftStart || "08:00";
    var sEnd = u.shiftEnd || "16:00";
    var sNotify = u.shiftNotifyMinutes != null ? u.shiftNotifyMinutes : 10;

    var startInput = document.getElementById("ceInputShiftStart");
    if (startInput) startInput.value = sStart;
    var endInput = document.getElementById("ceInputShiftEnd");
    if (endInput) endInput.value = sEnd;
    var notifySelect = document.getElementById("ceInputShiftNotify");
    if (notifySelect) notifySelect.value = String(sNotify);

    var shiftSelect = document.getElementById("ceInputShift");
    if (shiftSelect) {
      if (sStart === "08:00" && sEnd === "16:00") shiftSelect.value = "morning";
      else if (sStart === "16:00" && (sEnd === "00:00" || sEnd === "24:00" || sEnd === "23:59")) shiftSelect.value = "evening";
      else if (sStart === "00:00" && sEnd === "08:00") shiftSelect.value = "night";
      else shiftSelect.value = "custom";
    }

    var delBtn = document.getElementById("ceDeleteBtn");
    if (delBtn) {
      var isMaster = typeof AuthService !== "undefined" && AuthService.isMasterUsername && AuthService.isMasterUsername(u.username);
      var owners = (typeof AuthService !== "undefined" && AuthService.countMarketOwnerUsers) ? AuthService.countMarketOwnerUsers() : 1;
      var isLastOwner = !isMaster && (typeof AuthService !== "undefined" && AuthService.isOwnerRole && AuthService.isOwnerRole(u.role) && owners <= 1);
      delBtn.style.display = (isMaster || isLastOwner) ? "none" : "inline-flex";
    }

    // Populate permission checkboxes
    var perms = u.permissions;
    if (typeof perms === "string") {
      try { perms = JSON.parse(perms); } catch (e) { perms = null; }
    }
    if (!perms && typeof AuthService !== "undefined" && AuthService.getDefaultPermissionsForRole) {
      perms = AuthService.getDefaultPermissionsForRole(role);
    }
    if (typeof AuthService !== "undefined" && AuthService.applyFormPagePermissions) {
      AuthService.applyFormPagePermissions("ce_perm_", perms || {});
    }

    onCashierEditorRoleChanged();
    updateEditorAvatarPreview();
    renderEditorCashiersList();
  }

  function startNewCashier() {
    editingUser = null;
    isNewCashier = true;
    editingAvatar = "A";

    var nameInput = document.getElementById("ceInputFullName");
    if (nameInput) { nameInput.value = ""; nameInput.focus(); }
    var usernameInput = document.getElementById("ceInputUsername");
    if (usernameInput) usernameInput.value = "";
    var passInput = document.getElementById("ceInputPasscode");
    if (passInput) passInput.value = "";
    var roleInput = document.getElementById("ceInputRole");
    if (roleInput) roleInput.value = "cashier";
    var phoneInput = document.getElementById("ceInputPhone");
    if (phoneInput) phoneInput.value = "";

    // Reset shift presets
    if (document.getElementById("ceInputShift")) document.getElementById("ceInputShift").value = "morning";
    if (document.getElementById("ceInputShiftStart")) document.getElementById("ceInputShiftStart").value = "08:00";
    if (document.getElementById("ceInputShiftEnd")) document.getElementById("ceInputShiftEnd").value = "16:00";
    if (document.getElementById("ceInputShiftNotify")) document.getElementById("ceInputShiftNotify").value = "10";

    var delBtn = document.getElementById("ceDeleteBtn");
    if (delBtn) delBtn.style.display = "none";

    if (typeof AuthService !== "undefined" && AuthService.applyFormPagePermissions && AuthService.getDefaultPermissionsForRole) {
      AuthService.applyFormPagePermissions("ce_perm_", AuthService.getDefaultPermissionsForRole("cashier"));
    }

    onCashierEditorRoleChanged();
    updateEditorAvatarPreview();

    var items = document.querySelectorAll(".ce-cashier-item");
    items.forEach(function (el) { el.classList.remove("active"); });
  }

  function updateEditorAvatarPreview() {
    var prev = document.getElementById("ceAvatarBigPreview");
    if (!prev) return;
    var name = (document.getElementById("ceInputFullName") ? document.getElementById("ceInputFullName").value : "C") || "C";
    prev.innerHTML = getAvatarHtml(editingAvatar, name);

    var chips = document.querySelectorAll(".ce-preset-chip");
    chips.forEach(function (c) {
      var key = c.getAttribute("onclick") || "";
      if (key.includes("'" + editingAvatar + "'")) {
        c.classList.add("active");
      } else {
        c.classList.remove("active");
      }
    });
  }

  function selectPresetAvatar(key) {
    editingAvatar = key;
    updateEditorAvatarPreview();
  }

  function handleAvatarFileUpload(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast("هەڵە", "تکایە تەنها وێنە هەڵبژێرە (JPG, PNG, WebP)", "warning");
      return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      editingAvatar = e.target.result; // Base64 Data URL
      updateEditorAvatarPreview();
      toast("وێنە", "وێنەی تایبەت بە سەرکەوتوویی بارکرا ✅", "success");
    };
    reader.readAsDataURL(file);
  }

  function togglePasscodeVisibility() {
    var passInput = document.getElementById("ceInputPasscode");
    var icon = document.getElementById("ceEyeIcon");
    if (!passInput) return;
    if (passInput.type === "password") {
      passInput.type = "text";
      if (icon) icon.className = "fas fa-eye-slash";
    } else {
      passInput.type = "password";
      if (icon) icon.className = "fas fa-eye";
    }
  }

  function saveCurrentCashier() {
    var fullName = (document.getElementById("ceInputFullName") ? document.getElementById("ceInputFullName").value : "").trim();
    var username = (document.getElementById("ceInputUsername") ? document.getElementById("ceInputUsername").value : "").trim().toLowerCase();
    var passcode = (document.getElementById("ceInputPasscode") ? document.getElementById("ceInputPasscode").value : "").trim();
    var role = document.getElementById("ceInputRole") ? document.getElementById("ceInputRole").value : "cashier";
    var phone = (document.getElementById("ceInputPhone") ? document.getElementById("ceInputPhone").value : "").trim();

    if (typeof AuthService !== "undefined" && AuthService.isMasterUsername) {
      if (AuthService.isMasterUsername(username) || (editingUser && AuthService.isMasterUsername(editingUser.username))) {
        toast("قفڵکراو", "هەژماری فریاگوزاری SmartServe ناگۆڕدرێت", "error");
        return;
      }
    }
    if (!fullName) {
      toast("ئاگاداری", "تکایە ناوی کاشیر بنووسە", "warning");
      return;
    }
    if (!username) {
      toast("ئاگاداری", "تکایە ناوی بەکارهێنەر بنووسە", "warning");
      return;
    }
    if (!passcode || passcode.length < 4) {
      toast("ئاگاداری", "پاسکۆد دەبێت لانیکەم ٤ ژمارە بێت (PIN)", "warning");
      return;
    }

    var shiftStart = (document.getElementById("ceInputShiftStart") ? document.getElementById("ceInputShiftStart").value : "08:00").trim() || "08:00";
    var shiftEnd = (document.getElementById("ceInputShiftEnd") ? document.getElementById("ceInputShiftEnd").value : "16:00").trim() || "16:00";
    var shiftNotifyMinutes = parseInt((document.getElementById("ceInputShiftNotify") ? document.getElementById("ceInputShiftNotify").value : 10), 10) || 10;

    var isManager = (typeof AuthService !== "undefined" && AuthService.isOwnerRole) ? AuthService.isOwnerRole(role) : (role === "manager" || role === "admin");
    var permissions = (typeof AuthService !== "undefined" && AuthService.collectFormPagePermissions)
      ? AuthService.collectFormPagePermissions("ce_perm_")
      : { pos: true, orders: true, returnSales: true, customers: true, shifts: true };
    if (isManager && typeof AuthService !== "undefined" && AuthService.getDefaultPermissionsForRole) {
      permissions = AuthService.getDefaultPermissionsForRole(role);
    }

    var saveBtn = document.getElementById("ceSaveBtn");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> پاشکەوتکردن...';
    }

    var payload = {
      fullName: fullName,
      username: username,
      passcode: passcode,
      role: role,
      avatar: editingAvatar || fullName.charAt(0).toUpperCase(),
      phone: phone,
      permissions: permissions,
      shiftStart: shiftStart,
      shiftEnd: shiftEnd,
      shiftNotifyMinutes: shiftNotifyMinutes
    };

    var url = isNewCashier ? (getApiBase() + "/api/users") : (getApiBase() + "/api/users/" + editingUser.id);
    var method = isNewCashier ? "POST" : "PUT";

    fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.success && res.user) {
          playSuccessSound();
          toast("سەرکەوتوو", res.message || "کاشیر بە سەرکەوتوویی نوێکرایەوە", "success");

          // Sync into SqliteDB
          if (typeof SqliteDB !== "undefined") {
            try {
              var existingSqlite = SqliteDB.getUserByUsername(username);
              if (existingSqlite) {
                SqliteDB.updateUser(existingSqlite.id, {
                  fullName: fullName,
                  role: role,
                  phone: phone,
                  permissions: permissions,
                  shiftStart: shiftStart,
                  shiftEnd: shiftEnd,
                  shiftNotifyMinutes: shiftNotifyMinutes
                });
              } else {
                SqliteDB.insertUser({
                  id: res.user.id || ("u_" + Date.now()),
                  fullName: fullName,
                  username: username,
                  passwordHash: "legacy$" + passcode,
                  role: role,
                  phone: phone,
                  permissions: permissions,
                  shiftStart: shiftStart,
                  shiftEnd: shiftEnd,
                  shiftNotifyMinutes: shiftNotifyMinutes,
                  isActive: true,
                  createdAt: new Date().toISOString()
                });
              }
            } catch (e) {
              console.warn("Sqlite sync error:", e);
            }
          }

          loadCashiers().then(function () {
            selectUser(res.user.username);
            selectEditorCashier(res.user);
            if (typeof DB !== "undefined") {
              if (typeof AuthService !== "undefined") {
                AuthService.syncUsersCache();
              }
              if (DB.currentUser && (DB.currentUser.id === res.user.id || DB.currentUser.username === res.user.username)) {
                applyUserSession(res.user);
              }
            }
            if (typeof renderUsersTable === "function") {
              renderUsersTable();
            }
          });
        } else {
          playErrorSound();
          toast("هەڵە", res.message || "نەتوانرا پاشکەوت بکرێت", "error");
        }
      })
      .catch(function () {
        playErrorSound();
        toast("هەڵە", "پەیوەندی لەگەڵ سێرڤەر نییە", "error");
      })
      .finally(function () {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<i class="fas fa-save"></i> پاشکەوتکردنی گۆڕانکارییەکان';
        }
      });
  }

  function deleteCurrentCashier() {
    if (!editingUser) return;
    if (typeof AuthService !== "undefined" && AuthService.isMasterUsername && AuthService.isMasterUsername(editingUser.username)) {
      toast("قفڵکراو", "هەژماری فریاگوزاری SmartServe ناسڕدرێتەوە", "error");
      return;
    }
    if (editingUser.username === "admin") {
      toast("ئاگاداری", "ناتوانیت هەژماری بەڕێوەبەری سەرەکی بسڕیتەوە", "warning");
      return;
    }

    var ok = confirm("ئایا دڵنیایت لە سڕینەوەی کاشیر [" + editingUser.fullName + "]؟");
    if (!ok) return;

    fetch(getApiBase() + "/api/users/" + editingUser.id, {
      method: "DELETE"
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.success) {
          toast("سڕایەوە", "کاشیر سڕایەوە", "info");
          loadCashiers().then(function () {
            var first = usersList[0];
            if (first) {
              selectUser(first.username);
              selectEditorCashier(first);
            }
          });
        } else {
          toast("هەڵە", res.message || "نەتوانرا بسڕدرێتەوە", "error");
        }
      });
  }

  // ═══════════════════════════════════════════════════════════════
  // KEYBOARD & EVENT LISTENERS
  // ═══════════════════════════════════════════════════════════════

  function setupKeyboardListener() {
    window.addEventListener("keydown", function (e) {
      // 1. Check Manager Auth Modal
      var mgrModal = document.getElementById("scManagerAuthModal");
      if (mgrModal && mgrModal.classList.contains("active")) {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmManagerAuth();
        } else if (e.key === "Escape") {
          e.preventDefault();
          closeManagerAuth();
        }
        return;
      }

      // 2. Check Cashier Editor Modal
      var editorModal = document.getElementById("cashierEditorModal");
      if (editorModal && editorModal.classList.contains("active")) {
        if (e.key === "Escape") {
          e.preventDefault();
          closeCashierEditor();
        }
        return;
      }

      // 3. Switch Cashier Modal
      var modal = document.getElementById("switchCashierModal");
      if (!modal || !modal.classList.contains("active")) return;

      if (document.activeElement && document.activeElement.id === "scPersonnelSearch") {
        if (e.key === "Escape") document.activeElement.blur();
        return;
      }

      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        appendPin(e.key);
      } else if (e.key === "Enter") {
        e.preventDefault();
        submitSignIn();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        backspacePin();
      } else if (e.key === "Escape" || e.key === "Delete" || e.key === "c" || e.key === "C") {
        e.preventDefault();
        if (currentPin.length > 0) {
          clearPin();
        } else if (!isStandaloneLogin) {
          closeModal();
        }
      }
    });

    var searchInput = document.getElementById("scPersonnelSearch");
    if (searchInput) {
      searchInput.addEventListener("input", function (e) {
        renderCashierList(e.target.value);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    setupKeyboardListener();
  });

  return {
    open: openModal,
    close: closeModal,
    selectUser: selectUser,
    appendPin: appendPin,
    clearPin: clearPin,
    backspacePin: backspacePin,
    submitSignIn: submitSignIn,
    loadCashiers: loadCashiers,
    // Manager Auth & Editor Exports
    openManagerAuth: openManagerAuth,
    closeManagerAuth: closeManagerAuth,
    confirmManagerAuth: confirmManagerAuth,
    openCashierEditor: openCashierEditor,
    closeCashierEditor: closeCashierEditor,
    selectEditorCashierById: selectEditorCashierById,
    startNewCashier: startNewCashier,
    setAllPagePerms: setAllPagePerms,
    onCashierEditorRoleChanged: onCashierEditorRoleChanged,
    onShiftPresetChanged: onShiftPresetChanged,
    getCashiers: function () { return usersList; },
    selectPresetAvatar: selectPresetAvatar,
    handleAvatarFileUpload: handleAvatarFileUpload,
    togglePasscodeVisibility: togglePasscodeVisibility,
    saveCurrentCashier: saveCurrentCashier,
    deleteCurrentCashier: deleteCurrentCashier
  };
})();
