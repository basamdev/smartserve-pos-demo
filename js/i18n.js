/* POS languages: ku (default), ar, en */
var I18n = (function () {
  var STORAGE_KEY = "pos_lang";
  var lang = "ku";
  var applying = false;

  var D = {
    "سیستەمی وەرگرتنی پارە": { ar: "نظام نقاط البيع", en: "Point of Sale System" },
    "سیستەمی خاڵی فرۆشتن": { ar: "نظام نقاط البيع", en: "Point of Sale" },
    "بەڕێوەبەر": { ar: "المدير", en: "Manager" },
    "کاشێر زیاد بکە": { ar: "أضف كاشير", en: "Add cashier" },
    "کاشێر (PIN)": { ar: "كاشير (PIN)", en: "Cashier (PIN)" },
    "کاشیرەکان (PIN)": { ar: "الكاشير (PIN)", en: "Cashiers (PIN)" },
    "ئیمەیل / ناوی بەکارهێنەر": { ar: "البريد / اسم المستخدم", en: "Email / Username" },
    "ئیمەیلی بەڕێوەبەر بنووسە": { ar: "أدخل بريد المدير", en: "Enter manager email" },
    "وشەی نهێنی": { ar: "كلمة المرور", en: "Password" },
    "وشەی نهێنی بەڕێوەبەر": { ar: "كلمة مرور المدير", en: "Manager password" },
    "چوونەژوورەوەی بەڕێوەبەر": { ar: "دخول المدير", en: "Manager sign in" },
    "چوونەژوورەوە": { ar: "تسجيل الدخول", en: "Sign in" },
    "وشەی نهێنیت لەبیرچووە؟": { ar: "نسيت كلمة المرور؟", en: "Forgot password?" },
    "پارێزراوە": { ar: "محمي", en: "Secure" },
    "چوونەژوورەوەی پارێزراو بۆ بەڕێوەبەر و سەرپەرشتیار": { ar: "دخول آمن للمدير والمشرف", en: "Secure login for manager and supervisor" },
    "چوونەژوورەوە بە PIN": { ar: "الدخول برقم PIN", en: "Sign in with PIN" },
    "دوای کردنەوەی POS، بەڕێوەبەر بە ئیمەیل و وشەی نهێنی دەچێتە ژوورەوە. پاشان لە پەڕەی بەکارهێنەران کاشێر، ئەدمین یان کۆگا زیاد دەکات و PIN دەداتێ.": { ar: "بعد فتح نقطة البيع، يسجّل المدير الدخول بالبريد وكلمة المرور. ثم يضيف الكاشير والمدير والمستودع ويضع رقم PIN.", en: "After opening the POS, the manager signs in with email and password, then adds cashiers, admins or warehouse staff and sets their PIN." },
    "کاشێر و کارمەندی کۆگا ناوی خۆیان هەڵدەبژێرن و PINـی ٤ ژمارەیی دەنووسن. ئەگەر لیستەکە بەتاڵە، سەرەتا بەڕێوەبەر دەبێت کارمەند زیاد بکات.": { ar: "يختار الكاشير وموظف المستودع اسمه ويكتب PIN من 4 أرقام. إذا كانت القائمة فارغة، يجب على المدير إضافة الموظفين أولاً.", en: "Cashiers and warehouse staff pick their name and enter a 4-digit PIN. If the list is empty, the manager must add staff first." },
    "١. فرۆشتن و کاشێر": { ar: "١. البيع والكاشير", en: "1. Sales & cashier" },
    "٢. کاڵا و کۆگا": { ar: "٢. السلع والمخزن", en: "2. Products & stock" },
    "٣. کۆمپانیا و کڕین": { ar: "٣. الشركات والشراء", en: "3. Suppliers & purchasing" },
    "٤. کڕیاران و قەرز": { ar: "٤. الزبائن والدين", en: "4. Customers & debt" },
    "٥. داشبۆرد و دارایی": { ar: "٥. لوحة التحكم والمالية", en: "5. Dashboard & finance" },
    "٦. بەڕێوەبردن و سیستەم": { ar: "٦. الإدارة والنظام", en: "6. Admin & system" },
    "خاڵی فرۆشتن (کاشێر)": { ar: "نقطة البيع (الكاشير)", en: "Point of sale (cashier)" },
    "پسوولەکانی فرۆشتن": { ar: "فواتير البيع", en: "Sales receipts" },
    "گەڕانەوەی فرۆشتن (مرتجع)": { ar: "مرتجع البيع", en: "Sales returns" },
    "شێفت و سندوق": { ar: "الوردية والصندوق", en: "Shift & cash drawer" },
    "بەرهەمەکان و نرخ": { ar: "المنتجات والأسعار", en: "Products & prices" },
    "پۆلەکان (بەشەکان)": { ar: "الأصناف (الأقسام)", en: "Categories" },
    "کۆگا و بەسەرچوون": { ar: "المخزن والانتهاء", en: "Stock & expiry" },
    "چاپی بارکۆد و لەزگە": { ar: "طباعة الباركود والملصقات", en: "Barcode & labels" },
    "کۆمپانیا و کڕین": { ar: "الشركات والشراء", en: "Suppliers & purchasing" },
    "کڕیاران و قەرز": { ar: "الزبائن والدين", en: "Customers & debt" },
    "داشبۆردی بەڕێوەبەر": { ar: "لوحة تحكم المدير", en: "Manager dashboard" },
    "بەکارهێنەران و کاشیرەکان": { ar: "المستخدمون والكاشير", en: "Users & cashiers" },
    "ڕێکخستنەکان": { ar: "الإعدادات", en: "Settings" },
    "دەرچوون": { ar: "تسجيل الخروج", en: "Sign out" },
    "داخستنی مێنیو": { ar: "إغلاق القائمة", en: "Close menu" },
    "داشبۆرد": { ar: "لوحة التحكم", en: "Dashboard" },
    "زانیاری گشتی": { ar: "معلومات عامة", en: "Overview" },
    "فرۆشتن (F1)": { ar: "البيع", en: "Sale" },
    "فرۆشتن": { ar: "البيع", en: "Sale" },
    "دروستکردنی QR": { ar: "إنشاء QR", en: "Create QR" },
    "ستایلی کاشێر (VIP)": { ar: "ستايل الكاشير (VIP)", en: "Cashier style (VIP)" },
    "ڕاگیراوەکان": { ar: "المعلّقة", en: "Held" },
    "کۆگای کاڵا (F10)": { ar: "مخزن السلع (F10)", en: "Products store (F10)" },
    "داغڵکردنی Excel": { ar: "استيراد Excel", en: "Import Excel" },
    "داغڵکردن لە Excel": { ar: "استيراد من Excel", en: "Import from Excel" },
    "داغڵکردنی کاڵا لە Excel / CSV": { ar: "استيراد السلع من Excel / CSV", en: "Import items from Excel / CSV" },
    "سنووری قەرز تەواو بوو": { ar: "اكتمل حد الدين", en: "Debt limit reached" },
    "داوای قەرز لە واتسئاپ": { ar: "مطالبة الدين عبر واتساب", en: "Ask for debt on WhatsApp" },
    "باشە": { ar: "حسناً", en: "OK" },
    "گەڕانەوە (F8)": { ar: "مرتجع (F8)", en: "Return (F8)" },
    "تەسلیمکردنی سندوق": { ar: "تسليم الصندوق", en: "Cash handover" },
    "دوگمە خێراکان": { ar: "الاختصارات", en: "Shortcuts" },
    "دوگمە خێراکان (F1)": { ar: "الاختصارات", en: "Shortcuts" },
    "شاشەی کڕیار (F9)": { ar: "شاشة الزبون (F9)", en: "Customer display (F9)" },
    "ئەدمین": { ar: "أدمن", en: "Admin" },
    "کاشیر": { ar: "كاشير", en: "Cashier" },
    "کاشێر": { ar: "كاشير", en: "Cashier" },
    "کۆگا": { ar: "المخزن", en: "Warehouse" },
    "شێفت: ناچالاک": { ar: "الوردية: غير نشطة", en: "Shift: inactive" },
    "تەنها سکان": { ar: "مسح فقط", en: "Scan only" },
    "لیستی کاڵا سکانکراوەکان (پسووڵەی فرۆشتن)": { ar: "قائمة السلع الممسوحة (فاتورة البيع)", en: "Scanned items (sale bill)" },
    "سکان": { ar: "مسح", en: "Scan" },
    "کۆی دانە": { ar: "عدد القطع", en: "Qty total" },
    "سەرەتایی": { ar: "المجموع الفرعي", en: "Subtotal" },
    "داشکاندن (%)": { ar: "الخصم (%)", en: "Discount (%)" },
    "باج": { ar: "الضريبة", en: "Tax" },
    "قازانج": { ar: "الربح", en: "Profit" },
    "کۆی گشتی": { ar: "الإجمالي", en: "Grand total" },
    "لیستی ڕاگیراوەکان": { ar: "قائمة المعلّقة", en: "Held bills" },
    "پاککردنەوە": { ar: "مسح", en: "Clear" },
    "کاڵای نوێ (F4)": { ar: "سلعة جديدة (F4)", en: "New item (F4)" },
    "داشکاندن (F5)": { ar: "خصم (F5)", en: "Discount (F5)" },
    "کارت / Card": { ar: "بطاقة / Card", en: "Card" },
    "کڕیار (F5)": { ar: "زبون (F5)", en: "Customer (F5)" },
    "ژمارەکان": { ar: "الأرقام", en: "Keypad" },
    "نەختینەی خێرا (دیناری عێراقی و ١٠٠ دۆلار)": { ar: "نقد سريع (دينار عراقي و 100 دولار)", en: "Quick cash (IQD & $100)" },
    "دینار": { ar: "دينار", en: "IQD" },
    "دۆلار": { ar: "دولار", en: "USD" },
    "پارەی تەواو": { ar: "المبلغ تمامًا", en: "Exact cash" },
    "تەواو": { ar: "تمام", en: "Exact" },
    "پارەی وەرگیراو": { ar: "المبلغ المستلم", en: "Cash received" },
    "پارەی گەڕاوە (ماوە)": { ar: "الباقي للزبون", en: "Change due" },
    "ئامادەیە": { ar: "جاهز", en: "Ready" },
    "کۆی گشتی پارەدان": { ar: "إجمالي الدفع", en: "Amount due" },
    "پارەدان و چاپ": { ar: "دفع وطباعة", en: "Pay & print" },
    "بێ چاپ": { ar: "بدون طباعة", en: "No print" },
    "سەبەتە ئامادەیە بۆ سکانکردن": { ar: "السلة جاهزة للمسح", en: "Cart ready to scan" },
    "بارکۆد سکان بکە یان کاڵایەک لە لیستەی دەستە ڕاست هەڵبژێرە": { ar: "امسح الباركود أو اختر سلعة من القائمة", en: "Scan a barcode or pick an item from the grid" },
    "ناوی مارکێت": { ar: "اسم السوق", en: "Store name" },
    "لقەکان": { ar: "الفروع", en: "Branches" },
    "چاپ و پسوڵە": { ar: "الطباعة والفاتورة", en: "Print & receipt" },
    "ڕووکار": { ar: "المظهر", en: "Appearance" },
    "فرۆشتن و کۆگا": { ar: "البيع والمخزن", en: "Sales & stock" },
    "باکئەپ": { ar: "نسخة احتياطية", en: "Backup" },
    "مۆڵەت و سیستەم": { ar: "الترخيص والنظام", en: "License & system" },
    "پاشکەوتکردنی ڕێکخستنەکان": { ar: "حفظ الإعدادات", en: "Save settings" },
    "ناوی مارکێت، چاپ، ڕووکار، باکئەپ — هەر بەشێک لە تابی خۆیەتی": { ar: "اسم السوق، الطباعة، المظهر، النسخة الاحتياطية — كل قسم في تبويبه", en: "Store name, printing, look, backup — each section has its tab" },
    "زمانی سیستەم": { ar: "لغة النظام", en: "System language" },
    "زمانی ڕووکاری POS هەڵبژێرە. کوردی و عەرەبی ڕاست بۆ چەپ، ئینگلیزی چەپ بۆ ڕاست.": { ar: "اختر لغة واجهة نقطة البيع. الكردية والعربية من اليمين لليسار، والإنجليزية من اليسار لليمين.", en: "Choose the POS interface language. Kurdish and Arabic are right-to-left; English is left-to-right." },
    "کوردی": { ar: "كردي", en: "Kurdish" },
    "عەرەبی": { ar: "العربية", en: "Arabic" },
    "ئینگلیزی": { ar: "الإنجليزية", en: "English" },
    "پاشکەوتکردن": { ar: "حفظ", en: "Save" },
    "پاشکەوت": { ar: "حفظ", en: "Save" },
    "هەڵوەشاندنەوە": { ar: "إلغاء", en: "Cancel" },
    "داخستن": { ar: "إغلاق", en: "Close" },
    "سڕینەوە": { ar: "حذف", en: "Delete" },
    "دەستکاری": { ar: "تعديل", en: "Edit" },
    "زیادکردن": { ar: "إضافة", en: "Add" },
    "گەڕان": { ar: "بحث", en: "Search" },
    "چاپ": { ar: "طباعة", en: "Print" },
    "سەرکەوتوو": { ar: "تم بنجاح", en: "Success" },
    "هەڵە": { ar: "خطأ", en: "Error" },
    "ئاگاداری": { ar: "تنبيه", en: "Warning" },
    "ڕێکخستنەکان پاشکەوت کران!": { ar: "تم حفظ الإعدادات!", en: "Settings saved!" },
    "زمان گۆڕدرا": { ar: "تم تغيير اللغة", en: "Language changed" },
    "POS ئێستا بەم زمانە کار دەکات.": { ar: "نقطة البيع تعمل الآن بهذه اللغة.", en: "The POS now uses this language." },
    "وەرگرتنی پارە": { ar: "استلام الدفع", en: "Checkout" },
    "فرۆشتن": { ar: "البيع", en: "Sales" },
    "بەرهەمەکان": { ar: "المنتجات", en: "Products" },
    "بەڕێوەبردنی بەرهەمەکان": { ar: "إدارة المنتجات", en: "Manage products" },
    "بڕگەکانی کۆگا": { ar: "أصناف المخزن", en: "Stock items" },
    "شیکاری فرۆشتن": { ar: "تحليل المبيعات", en: "Sales analytics" },
    "پۆلەکان": { ar: "الأصناف", en: "Categories" },
    "بەڕێوەبردنی پۆلەکان": { ar: "إدارة الأصناف", en: "Manage categories" },
    "ڕێکخستن": { ar: "إعداد", en: "Setup" },
    "دەفتەری قەرز و دانەوە": { ar: "دفتر الدين والتسديد", en: "Debt ledger" },
    "شێفت": { ar: "وردية", en: "Shift" },
    "بەڕێوەبردنی شێفت": { ar: "إدارة الوردية", en: "Manage shift" },
    "گەڕانەوەی فرۆشتن": { ar: "مرتجع البيع", en: "Sales return" },
    "بەڕێوەبردنی گەڕانەوە": { ar: "إدارة المرتجع", en: "Manage returns" },
    "داواکارییەکان": { ar: "الطلبات", en: "Orders" },
    "مێژووی فرۆشتن و پسوولەکان": { ar: "سجل البيع والفواتير", en: "Sales history & receipts" },
    "ستۆدیۆی بارکۆد و QR": { ar: "استوديو الباركود و QR", en: "Barcode & QR studio" },
    "بەڕێوەبردنی کاشیرەکان، بەکارهێنەران و دەسەڵاتەکان": { ar: "إدارة الكاشير والمستخدمين والصلاحيات", en: "Manage cashiers, users and permissions" },
    "پوختەی کار، پارە، مەسرەف و قازانج": { ar: "ملخص العمل والمال والمصاريف والربح", en: "Summary of sales, cash, expenses and profit" },
    "کاشێری نوێ + PIN": { ar: "كاشير جديد + PIN", en: "New cashier + PIN" },
    "ئەدمینی نوێ": { ar: "أدمن جديد", en: "New admin" },
    "کۆگای نوێ + PIN": { ar: "مستودع جديد + PIN", en: "New warehouse + PIN" },
    "گۆڕینی PIN": { ar: "تغيير PIN", en: "Change PIN" },
    "گۆڕینی ئیمەیل و وشەی نهێنی من": { ar: "تغيير بريدي وكلمة المرور", en: "Change my email & password" },
    "ناوی تەواو": { ar: "الاسم الكامل", en: "Full name" },
    "ناوی بەکارهێنەر": { ar: "اسم المستخدم", en: "Username" },
    "تەلەفۆن": { ar: "هاتف", en: "Phone" },
    "ڕۆڵ": { ar: "الدور", en: "Role" },
    "دۆخ": { ar: "الحالة", en: "Status" },
    "چالاک": { ar: "نشط", en: "Active" },
    "ناچالاک": { ar: "غير نشط", en: "Inactive" },
    "PINـی ٤ ژمارەیی *": { ar: "PIN من 4 أرقام *", en: "4-digit PIN *" },
    "دووبارە PIN *": { ar: "أعد PIN *", en: "Confirm PIN *" },
    "کاشێر — PIN": { ar: "كاشير — PIN", en: "Cashier — PIN" },
    "بەڕێوەبەر — ئیمەیل": { ar: "مدير — بريد", en: "Manager — email" },
    "ئەدمین — ئیمەیل": { ar: "أدمن — بريد", en: "Admin — email" },
    "کۆگا — PIN": { ar: "مستودع — PIN", en: "Warehouse — PIN" },
    "ئیمەیل یان وشەی نهێنیت لەبیرچووە؟": { ar: "نسيت البريد أو كلمة المرور؟", en: "Forgot email or password?" },
    "PINـی گەڕاندنەوە *": { ar: "PIN الاستعادة *", en: "Recovery PIN *" },
    "ئیمەیلی نوێ *": { ar: "البريد الجديد *", en: "New email *" },
    "وشەی نهێنی نوێ *": { ar: "كلمة المرور الجديدة *", en: "New password *" },
    "دووبارەکردنەوەی وشەی نهێنی *": { ar: "أعد كلمة المرور *", en: "Confirm password *" },
    "پاشکەوتکردنی ئیمەیل و وشەی نهێنی نوێ": { ar: "حفظ البريد وكلمة المرور الجديدة", en: "Save new email & password" },
    "هەنگاوی داهاتوو: کارمەند زیاد بکە": { ar: "الخطوة التالية: أضف موظفًا", en: "Next: add staff" },
    "ئێستا کاشێر زیاد بکە": { ar: "أضف كاشير الآن", en: "Add cashier now" },
    "دواتر": { ar: "لاحقًا", en: "Later" },
    "ڕێگەپێدراو نییە 🔒": { ar: "غير مسموح 🔒", en: "Not allowed 🔒" },
    "ئەم بەشە تایبەتە بە بەڕێوەبەر و خاوەن مارکێت": { ar: "هذا القسم خاص بالمدير ومالك السوق", en: "This section is for the manager and store owner" },
    "قەرز": { ar: "دين", en: "Credit" },
    "پارەی نقد": { ar: "نقد", en: "Cash" },
    "کارت": { ar: "بطاقة", en: "Card" },
    "بەیانیان (08:00 AM - 04:00 PM)": { ar: "صباحي (08:00 - 16:00)", en: "Morning (08:00 AM - 04:00 PM)" },
    "ئێواران (04:00 PM - 12:00 AM)": { ar: "مسائي (16:00 - 00:00)", en: "Evening (04:00 PM - 12:00 AM)" },
    "شەوان (12:00 AM - 08:00 AM)": { ar: "ليلي (00:00 - 08:00)", en: "Night (12:00 AM - 08:00 AM)" },
    "دوایین فرۆشتن": { ar: "آخر المبيعات", en: "Recent sales" },
    "بڕگە": { ar: "صنف", en: "Item" },
    "بەروار": { ar: "التاريخ", en: "Date" },
    "ناوی مارکێت / دوکان *": { ar: "اسم السوق / المحل *", en: "Store name *" },
    "ژمارەی تەلەفۆن": { ar: "رقم الهاتف", en: "Phone number" },
    "ناونیشانی تەواو": { ar: "العنوان الكامل", en: "Full address" },
    "ئیمەیڵ": { ar: "البريد", en: "Email" },
    "وێبسایت": { ar: "الموقع", en: "Website" },
    "بارکردنی لۆگۆ": { ar: "رفع الشعار", en: "Upload logo" },
    "سڕینەوەی لۆگۆ": { ar: "حذف الشعار", en: "Remove logo" },
    "لۆگۆ دیاری نەکراوە": { ar: "لم يُحدد شعار", en: "No logo selected" },
    "ناسنامەی مارکێت و لۆگۆ (Market Brand & Logo)": { ar: "هوية السوق والشعار", en: "Store brand & logo" },
    "ستۆدیۆی ڕووکار و ڕەنگ (Themes & Color Studio)": { ar: "استوديو المظهر والألوان", en: "Themes & color studio" },
    "هەموو": { ar: "الكل", en: "All" },
    "نرخ": { ar: "السعر", en: "Price" },
    "کۆگا": { ar: "المخزن", en: "Stock" },
    "دانە": { ar: "قطعة", en: "Qty" },
    "ناو": { ar: "الاسم", en: "Name" },
    "کردار": { ar: "إجراء", en: "Actions" },
    "پسوولە": { ar: "فاتورة", en: "Receipt" },
    "کڕیار": { ar: "زبون", en: "Customer" },
    "کڕیاری نوێ": { ar: "زبون جديد", en: "New customer" },
    "پارەدان": { ar: "الدفع", en: "Payment" },
    "گەڕانەوە": { ar: "مرتجع", en: "Return" },
    "کۆگا": { ar: "المخزن", en: "Warehouse" },
    "فرۆشتنی ئەمڕۆ": { ar: "مبيعات اليوم", en: "Today's sales" },
    "مەسرەفی ئەمڕۆ": { ar: "مصروف اليوم", en: "Today's expenses" },
    "قازانجی سافی ئەمڕۆ": { ar: "صافي ربح اليوم", en: "Today's net profit" },
    "کۆگای کەم": { ar: "مخزون منخفض", en: "Low stock" },
    "نرخی فرۆشتنی کۆگا": { ar: "قيمة بيع المخزن", en: "Stock sale value" },
    "بینینی کۆگا": { ar: "عرض المخزن", en: "View stock" },
    "چوون بۆ کاشێر": { ar: "الذهاب للكاشير", en: "Go to cashier" },
    "ناوی مارکێت / لق": { ar: "اسم السوق / الفرع", en: "Store / branch name" },
    "زیادکردنی لق": { ar: "إضافة فرع", en: "Add branch" },
    "مارکێتی دووەم / فرە-لق": { ar: "سوق ثانٍ / عدة فروع", en: "Second store / multi-branch" },
    "ئاگاداری کۆگا": { ar: "تنبيه المخزن", en: "Stock alerts" },
    "مەسرەفی نوێ": { ar: "مصروف جديد", en: "New expense" },
    "چاپی ڕاپۆرت": { ar: "طباعة التقرير", en: "Print report" },
    "هەناردەی Excel": { ar: "تصدير Excel", en: "Export Excel" },
    "١. پوختەی ئەمڕۆ": { ar: "١. ملخص اليوم", en: "1. Today's summary" },
    "٢. تەرازووی پارە و قازانج": { ar: "٢. ميزان المال والربح", en: "2. Cash & profit" },
    "٣. مەسرەف": { ar: "٣. المصروف", en: "3. Expenses" },
    "٤. شیکاری فرۆشتن": { ar: "٤. تحليل المبيعات", en: "4. Sales analytics" },
    "باشترین بەرهەمەکانی ئەمڕۆ": { ar: "أفضل منتجات اليوم", en: "Today's top products" },
    "بەسەرچوون": { ar: "انتهاء الصلاحية", en: "Expiry" },
    "کاشیرەکانی ئەمڕۆ": { ar: "كاشير اليوم", en: "Today's cashiers" },
    "ئەمڕۆ": { ar: "اليوم", en: "Today" },
    "٧ ڕۆژ": { ar: "٧ أيام", en: "7 days" },
    "ئەم مانگە": { ar: "هذا الشهر", en: "This month" },
    "مانگی پێشوو": { ar: "الشهر السابق", en: "Last month" },
    "ئەمساڵ": { ar: "هذه السنة", en: "This year" },
    "هەمووی": { ar: "الكل", en: "All" },
    "مەسرەف": { ar: "مصروف", en: "Expense" },
    "قازانجی سافی": { ar: "صافي الربح", en: "Net profit" },
    "ناوی بەرهەم": { ar: "اسم المنتج", en: "Product name" },
    "دانە / بڕ": { ar: "الكمية", en: "Qty" },
    "کاڵاکان": { ar: "السلع", en: "Items" },
    "وێنە": { ar: "صور", en: "Images" },
    "پوختە": { ar: "الملخص", en: "Summary" },
    "پارەی خێرا": { ar: "نقد سريع", en: "Quick cash" },
    "کاتژمێر": { ar: "الساعة", en: "Clock" },
    "هەموو شتێک": { ar: "كل شيء", en: "Everything" },
    "شاشەی سادە": { ar: "شاشة بسيطة", en: "Simple screen" },
    "پیشاندانی شاشەی کاشێر": { ar: "عرض شاشة الكاشير", en: "Cashier screen display" },
    "کاڵا، پۆل، نرخ و بەشەکان پیشان بدە یان بشارەوە": { ar: "أظهر أو أخف السلع والأصناف والأسعار والأقسام", en: "Show or hide items, categories, prices and panels" },
    "داگرتنی باکئەپ (.db)": { ar: "تنزيل النسخة الاحتياطية (.db)", en: "Download backup (.db)" },
    "گەڕاندنەوەی باکئەپ (Restore)": { ar: "استعادة النسخة الاحتياطية", en: "Restore backup" },
    "پشکنینی سێرڤەر...": { ar: "فحص السيرفر...", en: "Checking server..." },
    "فلتەر": { ar: "تصفية", en: "Filter" },
    "تێچووی کاڵا": { ar: "تكلفة السلع", en: "Cost of goods" },
    "ڕێژەی سافی": { ar: "نسبة الصافي", en: "Net %" },
    "پوختەی کار، پارە، مەسرەف و قازانج — هەمووی لەم پەڕەیەدایە": { ar: "ملخص العمل والمال والمصاريف والربح — كله في هذه الصفحة", en: "Sales, cash, expenses and profit — all on this page" },
    "کڕیاران:": { ar: "الزبائن:", en: "Customers:" },
    "گەش": { ar: "ظاهر", en: "On" },
    "کاڵا": { ar: "سلعة", en: "Item" },
    "پۆل": { ar: "صنف", en: "Category" },
    "لە:": { ar: "من:", en: "From:" },
    "بۆ:": { ar: "إلى:", en: "To:" },
    "تەرازووی فرۆشتن، مەسرەف و قازانج": { ar: "ميزان المبيعات والمصروف والربح", en: "Sales, expenses and profit" },
    "مەسرەف و خەرجییەکان": { ar: "المصروف والنفقات", en: "Expenses" },
    "مەندوب، داواکاری واتسئاپ و وەسڵی کڕین": { ar: "المندوب وطلبات واتساب وفواتير الشراء", en: "Reps, WhatsApp orders and purchase invoices" },
    "وەسڵی کڕین و زیادکردنی کۆگا": { ar: "فاتورة الشراء وزيادة المخزن", en: "Purchase invoice and stock in" },
    "کڕیار، دەفتەری قەرز و دانەوە": { ar: "الزبون ودفتر الدين والتسديد", en: "Customer, debt ledger and payments" },
    "دروستکردنی بارکۆدی نوێ (ناو + ژمارە) و چاپی لەزگە": { ar: "إنشاء باركود جديد (اسم + رقم) وطباعة الملصق", en: "Create a new barcode (name + number) and print labels" },
    "ناوی بەکارهێنەر / ئیمەیل": { ar: "اسم المستخدم / البريد", en: "Username / email" },
    "زیادکردنی کارمەند": { ar: "إضافة موظف", en: "Add staff" },
    "لیستی بەکارهێنەران": { ar: "قائمة المستخدمين", en: "Users list" },
    "دەسەڵاتەکان": { ar: "الصلاحيات", en: "Permissions" },
    "پسوولەی نوێ": { ar: "فاتورة جديدة", en: "New receipt" },
    "گەڕان بە پسوولە / کڕیار": { ar: "بحث بالفاتورة / الزبون", en: "Search receipt / customer" },
    "کردنەوەی شێفت": { ar: "فتح الوردية", en: "Open shift" },
    "داخستنی شێفت": { ar: "إغلاق الوردية", en: "Close shift" },
    "کۆی سندوق": { ar: "مجموع الصندوق", en: "Drawer total" },
    "زیادکردنی بەرهەم": { ar: "إضافة منتج", en: "Add product" },
    "بارکۆد": { ar: "باركود", en: "Barcode" },
    "کۆگای ئێستا": { ar: "المخزون الحالي", en: "Current stock" },
    "نرخی کڕین": { ar: "سعر الشراء", en: "Cost price" },
    "نرخی فرۆشتن": { ar: "سعر البيع", en: "Sale price" },
    "پۆلێنکردنی مەسرەفەکان لەم ماوەیەدا": { ar: "تصنيف المصاريف في هذه الفترة", en: "Expense breakdown for this period" },
    "وردەکاری ڕۆژانە: فرۆشتن بەرامبەر مەسرەف": { ar: "التفاصيل اليومية: المبيعات مقابل المصروف", en: "Daily detail: sales vs expenses" },
    "دوگمەکانی شاشەی کاشێر": { ar: "أزرار شاشة الكاشير", en: "Cashier screen buttons" },
    "دیاری بکە کام دوگمە لە پەڕەی کاشێر دەربکەوێت. پەڕەکان تەنها ئەگەر دایانبگریتەوە وەک دوگمە لەسەر کاشێر دەردەکەون.": { ar: "حدد أي الأزرار تظهر في صفحة الكاشير. الصفحات تظهر كأزرار على الكاشير فقط إذا فعّلتها.", en: "Choose which buttons appear on the cashier page. Pages show as cashier buttons only when you turn them on." },
    "ئامرازەکانی کاشێر": { ar: "أدوات الكاشير", en: "Cashier tools" },
    "پەڕەکان لەسەر شاشەی کاشێر": { ar: "الصفحات على شاشة الكاشير", en: "Pages on cashier screen" },
    "ئەگەر پەڕەیەک دابگیرسێنیت، دوگمەکەی لەسەر شاشەی کاشێر دەردەکەوێت — کاشێر پێویستی بە مێنیوی تەواو نابێت بۆ ئەو پەڕانە.": { ar: "إذا فعّلت صفحة، يظهر زرها على شاشة الكاشير — دون الحاجة للقائمة الكاملة.", en: "Turn on a page and its button appears on the cashier screen — no need for the full menu." },
    "هەموو ئامرازەکان": { ar: "كل الأدوات", en: "All tools" },
    "کاشێری سادە": { ar: "كاشير بسيط", en: "Simple cashier" },
    "شاردنەوەی پەڕەکان": { ar: "إخفاء الصفحات", en: "Hide pages" },
    "پیشاندراو": { ar: "ظاهر", en: "Shown" },
    "شاراوە": { ar: "مخفي", en: "Hidden" },
    "دوگمەکان نوێکرانەوە.": { ar: "تم تحديث الأزرار.", en: "Buttons updated." },
    "هەموو ئامرازەکان پیشاندران.": { ar: "ظهرت كل الأدوات.", en: "All tools are visible." },
    "تەنها دوگمە پێویستەکان مانەوە.": { ar: "بقيت الأزرار الضرورية فقط.", en: "Only the essential buttons remain." },
    "دوگمەی پەڕەکان لە کاشێر شاردرایەوە.": { ar: "أُخفيت أزرار الصفحات من الكاشير.", en: "Page buttons were hidden from cashier." },
    "شاشەی کاشێر": { ar: "شاشة الكاشير", en: "Cashier screen" },
    "کاڵای زۆرترین فرۆشتن لە ئەمڕۆدا": { ar: "أكثر السلع مبيعًا اليوم", en: "Best-selling items today" },
    "کاڵای کەم ماوە — پێویستە بیکڕیتەوە": { ar: "سلع قليلة — يجب إعادة شرائها", en: "Low stock — reorder these items" },
    "کاڵای نزیک تەواوبوون لە ٧ ڕۆژی داهاتوو": { ar: "سلع تنتهي خلال ٧ أيام", en: "Items expiring in the next 7 days" },
    "کێ فرۆشیوە و چەند پسوڵەی هەیە": { ar: "من باع وكم فاتورة لديه", en: "Who sold and how many receipts" },
    "دوایین پسوڵەکان — کلیک بکە بۆ هەموویان": { ar: "آخر الفواتير — اضغط لعرض الكل", en: "Latest receipts — tap to see all" },
    "پسوولەکان": { ar: "الفواتير", en: "Receipts" },
    "ئەمڕۆ هێشتا هیچ کاڵایەک نەفرۆشراوە": { ar: "لم تُبع أي سلعة اليوم بعد", en: "No items sold yet today" },
    "کۆگا باشە — هیچ کاڵایەک کەم نییە": { ar: "المخزن جيد — لا توجد سلعة قليلة", en: "Stock is fine — nothing is low" },
    "لە ٧ ڕۆژی داهاتوودا هیچ کاڵایەک تەواو نابێت": { ar: "لا تنتهي أي سلعة خلال ٧ أيام", en: "Nothing expires in the next 7 days" },
    "ئەمڕۆ هێشتا هیچ کاشیرێک فرۆشی نەکردووە": { ar: "لم يبع أي كاشير اليوم بعد", en: "No cashier has sold yet today" },
    "هێشتا هیچ پسوڵەیەک نییە": { ar: "لا توجد فواتير بعد", en: "No receipts yet" },
    "ستۆدیۆی ڕووکار و ڕەنگ": { ar: "استوديو المظهر والألوان", en: "Look & color studio" },
    "ڕووکاری گشتی": { ar: "المظهر العام", en: "App theme" },
    "ڕەنگی دڵخواز": { ar: "لون مخصص", en: "Custom color" },
    "پێشنیارە خێراکان": { ar: "اختيارات سريعة", en: "Quick picks" },
    "پێشبینین:": { ar: "معاينة:", en: "Preview:" },
    "ستایلی شاهانەی پەڕەی کاشێر": { ar: "ستايل الكاشير الفاخر", en: "Luxury cashier style" },
    "ڕووکاری شاشەی فرۆشتن هەڵبژێرە:": { ar: "اختر مظهر شاشة البيع:", en: "Choose the cashier look:" },
    "ستایلی کارتی کاڵاکان": { ar: "ستايل بطاقة السلع", en: "Item card style" },
    "قەبارە و ستوونی کاڵاکان": { ar: "حجم وأعمدة السلع", en: "Item grid size" },
    "شوێنی پسوولە و کاڵاکان": { ar: "موضع الفاتورة والسلع", en: "Bill & items layout" },
    "پیشاندانی قازانج لە شاشەی کاشێر": { ar: "إظهار الربح في شاشة الكاشير", en: "Show profit on cashier" },
    "پیشاندانی دۆلاری ئەمریکی ($ USD) لە شاشەی کاشێر": { ar: "إظهار الدولار في شاشة الكاشير", en: "Show USD on cashier" },
    "خەرجی سندوق": { ar: "مصروفات الصندوق", en: "Expenses" },
    "درا بە قاسە": { ar: "أُعطي للخزنة", en: "Given to Safe" },
    "کۆی گەڕانەوەکان": { ar: "إجمالي المرتجعات", en: "Total Refunds" },
    "وەرگیراو": { ar: "المستلم", en: "Received" },
    "لە قاسە هێنرا": { ar: "أُخذ من الخزنة", en: "Taken from Safe" },
    "پارەی بەدەست": { ar: "النقد في اليد", en: "Cash on Hand" },
    "فرۆشتنی نەقدی ڕاپۆرت": { ar: "مبيعات النقد", en: "Reports Cash Sales" },
    "تەسلیمکردنی فەرمی سندوق": { ar: "التسليم الرسمي للصندوق", en: "Official cash handover" },
    "ژمێرەری کاشێر": { ar: "عداد الكاشير", en: "Cashier count" },
    "ژماردن": { ar: "عدّ", en: "Count" },
    "وێنەی تابلۆ": { ar: "صورة اللوحة", en: "Photo" },
    "ناردن": { ar: "إرسال", en: "Send" },
    "پێشوو": { ar: "السابق", en: "Previous" },
    "کاشیری دواتر": { ar: "الكاشير التالي", en: "Next cashier" },
    "بەیانی": { ar: "صباح", en: "Morning" },
    "ئێوارە": { ar: "مساء", en: "Evening" },
    "شەو": { ar: "ليل", en: "Night" },
    "تێبینی": { ar: "ملاحظة", en: "Note" },
    "ئارەزوومەندانە": { ar: "اختياري", en: "Optional" },
    "کورتهێنان": { ar: "نقص", en: "Shortage" },
    "زیادە": { ar: "زيادة", en: "Overage" },
    "ڕێکە": { ar: "مطابق", en: "Match" },
    "سندوق و سیستەم یەکسانن": { ar: "الصندوق والنظام متطابقان", en: "Drawer and system match" },
    "پارەی بەدەست لەگەڵ سیستەم بەراورد دەکرێت": { ar: "يُقارن النقد في اليد مع النظام", en: "Cash on hand is compared with the system" },
    "دیناری عێراقی": { ar: "دينار عراقي", en: "Iraqi dinar" }
  };

  function normalize(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  var REVERSE = {};
  var AMBIGUOUS = {};
  Object.keys(D).forEach(function (ku) {
    var row = D[ku];
    if (!row) return;
    ["ar", "en"].forEach(function (l) {
      var n = normalize(row[l]);
      if (!n || n === ku) return;
      if (REVERSE[n] && REVERSE[n] !== ku) AMBIGUOUS[n] = true;
      else REVERSE[n] = ku;
    });
  });

  function kuKey(text) {
    var n = normalize(text);
    if (!n) return "";
    if (D[n]) return n;
    if (AMBIGUOUS[n]) return "";
    return REVERSE[n] || "";
  }

  function isTranslationOf(key, text) {
    var n = normalize(text);
    if (!key || !n) return false;
    if (n === key) return true;
    var row = D[key];
    if (!row) return false;
    return normalize(row.ar) === n || normalize(row.en) === n;
  }

  function t(text) {
    if (text == null) return "";
    var src = normalize(text);
    if (!src) return text;
    var key = D[src] ? src : kuKey(src);
    if (!key) key = src;
    if (lang === "ku") return D[key] ? key : text;
    var row = D[key];
    if (row && row[lang]) return row[lang];
    var m = src.match(/^(.*?)(\s*\(.*)$/);
    if (m && D[m[1].trim()] && D[m[1].trim()][lang]) {
      return D[m[1].trim()][lang] + m[2];
    }
    return text;
  }

  function getDirectText(el) {
    var out = "";
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3) out += el.childNodes[i].nodeValue;
    }
    return normalize(out);
  }

  function setDirectText(el, text) {
    var nodes = [];
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3 && el.childNodes[i].nodeValue.trim()) nodes.push(el.childNodes[i]);
    }
    if (!nodes.length) {
      el.appendChild(document.createTextNode(text));
      return;
    }
    var raw = nodes[0].nodeValue;
    var lead = raw.match(/^\s*/)[0];
    var trail = raw.match(/\s*$/)[0];
    nodes[0].nodeValue = lead + text + trail;
    for (var j = 1; j < nodes.length; j++) nodes[j].nodeValue = "";
  }

  var LIVE_I18N_SKIP_IDS = {
    headerCashierName: 1,
    userName: 1,
    userAvatar: 1,
    hoFooterCashierName: 1,
    hoBoardStoreName: 1,
    hoPillNameMorning: 1,
    hoPillNameEvening: 1,
    hoPillNameNight: 1,
    hoCashCountHint: 1,
    agrCashierName: 1,
    headerTime: 1,
    headerDate: 1,
    headerAmPm: 1
  };

  function shouldSkip(el) {
    if (!el || !el.closest) return true;
    if (el.id && LIVE_I18N_SKIP_IDS[el.id]) return true;
    if (el.closest("[data-no-i18n]")) return true;
    if (el.closest("script,style,code,pre,textarea")) return true;
    var tag = (el.tagName || "").toLowerCase();
    if (tag === "script" || tag === "style" || tag === "code") return true;
    return false;
  }

  function captureKuAttr(el, attr, value) {
    var stored = el.getAttribute(attr);
    var key = kuKey(stored || value);
    if (key) {
      el.setAttribute(attr, key);
      return key;
    }
    if (!stored && value) el.setAttribute(attr, value);
    return stored || value || "";
  }

  function resolveOrigin(current, stored) {
    if (D[current]) return current;
    if (stored && D[stored] && isTranslationOf(stored, current)) return stored;
    return kuKey(current) || "";
  }

  function translateNode(el) {
    if (shouldSkip(el)) return;
    var tag = (el.tagName || "").toLowerCase();
    if ((tag === "input" || tag === "textarea") && el.placeholder) {
      var ph = captureKuAttr(el, "data-i18n-ph", el.placeholder);
      el.placeholder = t(ph);
    }
    if (el.title) {
      var ti = captureKuAttr(el, "data-i18n-title", el.title);
      el.title = t(ti);
    }
    if (tag === "option") {
      var curOpt = normalize(el.textContent);
      if (!curOpt) return;
      var originOpt = resolveOrigin(curOpt, el.getAttribute("data-i18n-src"));
      if (originOpt) {
        el.setAttribute("data-i18n-src", originOpt);
        var nextOpt = lang === "ku" ? originOpt : t(originOpt);
        if (nextOpt && nextOpt !== curOpt) el.textContent = nextOpt;
      }
      return;
    }
    var current = getDirectText(el);
    if (!current) return;
    if (/^[\d\s.,:%$+\-()/]+$/.test(current)) return;
    var origin = resolveOrigin(current, el.getAttribute("data-i18n-src"));
    if (!origin) {
      if (el.getAttribute("data-i18n-src") && !isTranslationOf(el.getAttribute("data-i18n-src"), current)) {
        el.removeAttribute("data-i18n-src");
      }
      return;
    }
    el.setAttribute("data-i18n-src", origin);
    var translated = lang === "ku" ? origin : t(origin);
    if (translated && translated !== current) setDirectText(el, translated);
  }

  function guessLabelIcon(text) {
    var s = String(text || "").toLowerCase();
    if (/ئیمەیل|ئیمەیڵ|بريد|email/.test(s)) return "fa-envelope";
    if (/وشەی نهێنی|كلمة المرور|password/.test(s)) return "fa-lock";
    if (/\bpin\b/.test(s)) return "fa-key";
    if (/تەلەفۆن|هاتف|phone/.test(s)) return "fa-phone";
    if (/ناونیشان|عنوان|address/.test(s)) return "fa-map-marker-alt";
    if (/بارکۆد|باركود|barcode/.test(s)) return "fa-barcode";
    if (/نرخی کڕین|سعر الشراء|cost/.test(s)) return "fa-shopping-cart";
    if (/نرخ|سعر|price/.test(s)) return "fa-tags";
    if (/کۆگا|مخزن|stock/.test(s)) return "fa-boxes";
    if (/دانە|كمية|qty|quantity|بڕ/.test(s)) return "fa-cubes";
    if (/پۆل|صنف|categor/.test(s)) return "fa-layer-group";
    if (/بەروار|تاريخ|date/.test(s)) return "fa-calendar-alt";
    if (/کڕیار|زبون|customer/.test(s)) return "fa-user";
    if (/مارکێت|سوق|store|دوکان|لق/.test(s)) return "fa-store";
    if (/لۆگۆ|شعار|logo/.test(s)) return "fa-image";
    if (/چاپ|طباعة|print/.test(s)) return "fa-print";
    if (/پسوڵ|فاتورة|receipt/.test(s)) return "fa-receipt";
    if (/باج|ضريب|tax/.test(s)) return "fa-percent";
    if (/وێب|موقع|web/.test(s)) return "fa-globe";
    if (/دۆلار|دولار|usd/.test(s)) return "fa-dollar-sign";
    if (/دراو|عملة|currency|دینار/.test(s)) return "fa-coins";
    if (/ڕەنگ|لون|color/.test(s)) return "fa-palette";
    if (/ستایل|ستايل|style/.test(s)) return "fa-clone";
    if (/ستوون|أعمدة|column|قەبارە|حجم/.test(s)) return "fa-th-large";
    if (/شوێن|موضع|layout/.test(s)) return "fa-columns";
    if (/قازانج|ربح|profit/.test(s)) return "fa-chart-line";
    if (/تێبینی|ملاحظ|note/.test(s)) return "fa-sticky-note";
    if (/گەڕان|بحث|search/.test(s)) return "fa-search";
    if (/مۆڵەت|ترخيص|license/.test(s)) return "fa-id-card";
    if (/کاشیر|كاشير|cashier/.test(s)) return "fa-user-tie";
    if (/ڕۆڵ|دور|role/.test(s)) return "fa-user-tag";
    if (/ناوی تەواو|الاسم الكامل|full name/.test(s)) return "fa-id-badge";
    if (/درووشم|tagline/.test(s)) return "fa-quote-right";
    if (/ناو|اسم|name/.test(s)) return "fa-signature";
    return "";
  }

  function decorateInputLabels(root) {
    var scope = root || document.body;
    if (!scope || !scope.querySelectorAll) return;
    var labels = scope.querySelectorAll(".input-group > label, .ce-input-group > label");
    for (var n = 0; n < labels.length; n++) {
      var lab = labels[n];
      if (lab.querySelector("i")) continue;
      if (lab.querySelector("input,select,textarea")) continue;
      if ((" " + (lab.className || "") + " ").indexOf(" btn ") !== -1) continue;
      var icon = guessLabelIcon(lab.textContent);
      if (!icon) continue;
      var el = document.createElement("i");
      el.className = "fas " + icon;
      el.setAttribute("aria-hidden", "true");
      lab.insertBefore(el, lab.firstChild);
    }
  }

  function apply(root) {
    if (applying) return;
    applying = true;
    try {
      var scope = root || document.body;
      if (!scope) return;
      var all = scope.querySelectorAll("label,button,span,p,h1,h2,h3,h4,h5,a,th,td,option,small,strong,legend,div,li");
      for (var i = 0; i < all.length; i++) translateNode(all[i]);
      var fields = scope.querySelectorAll("input[placeholder],textarea[placeholder],[title]");
      for (var j = 0; j < fields.length; j++) translateNode(fields[j]);
      decorateInputLabels(scope);
      highlightChips();
    } finally {
      applying = false;
    }
  }

  function highlightChips() {
    var chips = document.querySelectorAll(".lang-chip[data-lang], .lang-choice[data-lang]");
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle("is-active", chips[i].getAttribute("data-lang") === lang);
    }
  }

  var applyTimer = null;
  var observerStarted = false;
  function scheduleApply() {
    if (applying) return;
    clearTimeout(applyTimer);
    applyTimer = setTimeout(function () {
      apply(document.body);
    }, 80);
  }
  function startObserver() {
    if (observerStarted || !window.MutationObserver || !document.body) return;
    observerStarted = true;
    var obs = new MutationObserver(function () {
      if (applying) return;
      scheduleApply();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function applyDocumentDir() {
    var html = document.documentElement;
    html.setAttribute("lang", lang === "en" ? "en" : lang === "ar" ? "ar" : "ku");
    html.setAttribute("dir", lang === "en" ? "ltr" : "rtl");
    html.setAttribute("data-lang", lang);
  }

  function set(next, opts) {
    opts = opts || {};
    next = String(next || "ku").toLowerCase();
    if (next !== "ar" && next !== "en") next = "ku";
    lang = next;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    applyDocumentDir();
    var sel = document.getElementById("setLanguage");
    if (sel) sel.value = lang;
    if (opts.persist !== false && typeof DB !== "undefined" && DB.settings) {
      DB.settings.language = lang;
      if (typeof DataStore !== "undefined" && DataStore.saveSettings) {
        try { DataStore.saveSettings(); } catch (e2) {}
      }
    }
    var appPage = document.getElementById("appPage");
    var appOpen = appPage && appPage.classList.contains("active");
    if (opts.fromUser && appOpen && typeof window.CURRENT_PAGE === "string" && typeof switchSection === "function") {
      try { switchSection(window.CURRENT_PAGE, true); } catch (e3) {}
    }
    apply(document.body);
    try {
      var roleEl = document.getElementById("userRole");
      if (roleEl && window.AuthService && AuthService.getSession) {
        var sess = AuthService.getSession();
        if (sess && AuthService.getRoleMeta) {
          roleEl.textContent = AuthService.getRoleMeta(sess.role).label;
        }
      }
    } catch (eRole) {}
    highlightChips();
    try { if (typeof renderBillStylePicker === "function") renderBillStylePicker(); } catch (eBill) {}
    try { if (typeof updateLiveReceiptPreview === "function") updateLiveReceiptPreview(); } catch (ePrev) {}
    try { if (typeof ShiftsManager !== "undefined" && ShiftsManager.recalcHandover) ShiftsManager.recalcHandover(); } catch (eHo) {}
    if (opts.toast !== false && opts.fromUser) {
      if (typeof toast === "function") toast("زمان گۆڕدرا", "POS ئێستا بەم زمانە کار دەکات.", "success");
    }
    return lang;
  }

  function init() {
    var saved = "";
    try { saved = localStorage.getItem(STORAGE_KEY) || ""; } catch (e) {}
    if (!saved && typeof DB !== "undefined" && DB.settings && DB.settings.language) saved = DB.settings.language;
    lang = saved === "ar" || saved === "en" ? saved : (saved === "ku" ? "ku" : "ku");
    applyDocumentDir();
    if (document.body) apply(document.body);
    highlightChips();
    return lang;
  }

  function current() { return lang; }

  return {
    t: t,
    set: set,
    init: init,
    apply: apply,
    current: current,
    observe: startObserver,
    dict: D
  };
})();

window.I18n = I18n;
window.t = function (s) { return I18n.t(s); };
if (document.body) {
  try { I18n.init(); } catch (eInit) {}
}

function selectPosLanguage(lang, fromUser) {
  I18n.set(lang, { persist: true, toast: true, fromUser: !!fromUser });
}
window.selectPosLanguage = selectPosLanguage;
