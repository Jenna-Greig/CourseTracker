//define variables

//buttons
//intro-screen
const startBtn = document.getElementById("getStarted");
//main-screen
const addClassBtn = document.getElementById("add-class");
const addEventBtn = document.getElementById("add-event");
const mainCalendarBtn = document.getElementById("main-calendarBtn");
//add-class-screen
const submitClassBtn = document.getElementById("submit-class");
const classFormBackBtn = document.getElementById("form-backBtn");
//add-event-screen
const submitEventBtn = document.getElementById("submit-event");
const eventFormBackBtn = document.getElementById("event-backBtn");
//main-calendar-screen
const calendarBackBtn = document.getElementById("calendar-backBtn");
const previousMonthBtn = document.getElementById("previous-month");
const nextMonthBtn = document.getElementById("next-month");
const calendarMonth = document.getElementById("calendar-month");
const calendarDays = document.getElementById("calendar-days");
const eventNameInput = document.getElementById("event-name");
const eventDateInput = document.getElementById("event-date");
const eventTimeInput = document.getElementById("event-time");
const eventClassInput = document.getElementById("event-class");
//class-screen
const classBackBtn = document.getElementById("class-backBtn");
const editClassBtn = document.getElementById("edit-class");
const classCalendarBtn = document.getElementById("class-calendar");
const classAssignmentBtn = document.getElementById("class-assignment");
const assignmentForm = document.getElementById("assignment-form");
const assignmentNameInput = document.getElementById("assignment-name");
const assignmentGradeInput = document.getElementById("assignment-grade");
const assignmentWeightInput = document.getElementById("assignment-weight");
const assignmentTypeInput = document.getElementById("assignment-type");
const overallGrade = document.getElementById("overall-grade");
const overallGradeDetail = document.getElementById("overall-grade-detail");
const classEventList = document.getElementById("class-event-list");
const classAssignmentList = document.getElementById("class-assignment-list");
const calendarPanel = document.getElementById("calendar-tab");
const assignmentPanel = document.getElementById("assignment-tab");
const appearanceDialog = document.getElementById("appearance-dialog");
const appearanceForm = document.getElementById("appearance-form");
const appearanceCloseBtn = document.getElementById("appearance-close");
const appearanceCancelBtn = document.getElementById("appearance-cancel");
const themeTextColorInput = document.getElementById("theme-text-color");
const themeBackgroundColorInput = document.getElementById("theme-background-color");
const themeFontInput = document.getElementById("theme-font");
const themeWallpaperInput = document.getElementById("theme-wallpaper");
const themeAssignmentColorInput = document.getElementById("theme-assignment-color");
const themeQuizColorInput = document.getElementById("theme-quiz-color");
const themeExamColorInput = document.getElementById("theme-exam-color");
const storageStatus = document.getElementById("storage-status");

//headers
const classHeader = document.getElementById("class-header");
const appTitle = document.querySelector(".app-title");
//tables
const classTable = document.getElementById("class-table");

//classes
const classes = document.getElementById("class-list");

//divs
//intro-screen
const introDiv = document.getElementById("start");
//main-screen
const mainDiv = document.getElementById("main");
const classDiv = document.getElementById("class-page");
const addClassDiv = document.getElementById("add-class-form");
const addEventDiv = document.getElementById("add-event-form");
const mainCalendarDiv = document.getElementById("main-calendar");
//class-screen

//reoccuring values
document.body.classList.add("app-loading");

let numClasses = 0;
const events = [];
const assignments = [];
const defaultClassTheme = {
    textColor: "#193b3b",
    backgroundColor: "#edf8f6",
    font: "Arial, sans-serif",
    wallpaper: "glow",
    assignmentColors: {
        assignment: "#d9eee9",
        quiz: "#e6def5",
        exam: "#f5e2d9"
    }
};
const legacyStorageKey = "courseTrackerData";
const apiUrl = "/api/data";
const availableFonts = [
    "Arial, sans-serif",
    "Georgia, serif",
    "'Trebuchet MS', sans-serif",
    "'Courier New', monospace"
];
const availableWallpapers = ["glow", "dots", "diagonal", "grid"];
const classThemes = new Map();
let activeClassCode = "";
let themeBeforeEdit;
let saveQueue = Promise.resolve();
let displayedMonth = new Date();
displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1);

function showStorageStatus(message) {
    storageStatus.textContent = message;
    storageStatus.hidden = !message;
}

function isValidColor(value) {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function createClassRow(code, name) {
    const row = document.createElement("tr");
    row.id = code;
    const cell = document.createElement("th");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "class-button";
    button.textContent = name;
    cell.appendChild(button);
    row.appendChild(cell);
    return row;
}

function buildAppData() {
    return {
        version: 1,
        classes: Array.from(classTable.rows, (row) => ({
            code: row.id,
            name: row.querySelector(".class-button").textContent
        })),
        events,
        assignments,
        classThemes: Object.fromEntries(classThemes)
    };
}

function saveAppData() {
    const data = buildAppData();
    saveQueue = saveQueue.catch(() => {}).then(async () => {
        const response = await fetch(apiUrl, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `The server returned ${response.status}.`);
        }
        showStorageStatus("");
    }).catch((error) => {
        console.error("Unable to save CourseTracker data to SQLite.", error);
        showStorageStatus(`Could not save changes to the SQL backend: ${error.message}`);
    });
    return saveQueue;
}

async function requestAppData(method, data) {
    const response = await fetch(apiUrl, {
        method,
        headers: data ? { "Content-Type": "application/json" } : undefined,
        body: data ? JSON.stringify(data) : undefined
    });
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.error || `The server returned ${response.status}.`);
    }
    return result;
}

async function migrateBrowserData(databaseData) {
    if (databaseData.classes.length > 0) return databaseData;

    let serializedData;
    try {
        serializedData = localStorage.getItem(legacyStorageKey);
    } catch (error) {
        console.error("Unable to access existing browser-saved data.", error);
        showStorageStatus("Could not check for browser-saved data to migrate.");
        return databaseData;
    }
    if (!serializedData) return databaseData;

    let browserData;
    try {
        browserData = JSON.parse(serializedData);
    } catch (error) {
        console.error("Existing browser-saved data is not valid JSON.", error);
        showStorageStatus("Existing browser-saved data could not be migrated and was left unchanged.");
        return databaseData;
    }
    try {
        await requestAppData("PUT", browserData);
        let migrated = true;
        try {
            localStorage.removeItem(legacyStorageKey);
        } catch (error) {
            console.error("Migrated browser data could not be removed.", error);
            showStorageStatus("Data was migrated to SQLite, but the old browser copy could not be removed.");
            migrated = false;
        }
        if (migrated) showStorageStatus("Your existing browser-saved data was moved to the SQL database.");
        return browserData;
    } catch (error) {
        console.error("Unable to migrate browser-saved data to SQLite.", error);
        showStorageStatus(`Could not migrate existing browser-saved data: ${error.message}`);
        throw error;
    }
}

function restoreAppData(storedData) {
    if (!storedData || storedData.version !== 1 ||
        !Array.isArray(storedData.classes) ||
        !Array.isArray(storedData.events) ||
        !Array.isArray(storedData.assignments) ||
        typeof storedData.classThemes !== "object" ||
        storedData.classThemes === null ||
        Array.isArray(storedData.classThemes)) {
        throw new Error("The SQL backend returned data in an unsupported format.");
    }

    const validClasses = storedData.classes.filter((course) =>
        course && typeof course.code === "string" && course.code.trim() &&
        typeof course.name === "string" && course.name.trim()
    ).slice(0, 8);
    const validCodes = new Set(validClasses.map((course) => course.code));
    classTable.replaceChildren();
    validClasses.forEach((course) => classTable.appendChild(createClassRow(course.code, course.name)));
    numClasses = validClasses.length;
    events.length = 0;
    assignments.length = 0;
    classThemes.clear();

    storedData.events.forEach((event) => {
        if (event && typeof event.name === "string" && typeof event.date === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(event.date) && typeof event.time === "string" &&
            validCodes.has(event.classCode)) {
            events.push({ name: event.name, date: event.date, time: event.time, classCode: event.classCode });
        }
    });

    storedData.assignments.forEach((assignment) => {
        if (assignment && typeof assignment.name === "string" &&
            Number.isFinite(assignment.grade) && assignment.grade >= 0 && assignment.grade <= 100 &&
            Number.isFinite(assignment.weight) && assignment.weight > 0 && assignment.weight <= 100 &&
            ["assignment", "quiz", "exam"].includes(assignment.type) &&
            validCodes.has(assignment.classCode)) {
            assignments.push({
                name: assignment.name,
                grade: assignment.grade,
                weight: assignment.weight,
                type: assignment.type,
                classCode: assignment.classCode
            });
        }

    });

    Object.entries(storedData.classThemes).forEach(([classCode, theme]) => {
        if (!validCodes.has(classCode) || !theme ||
            !isValidColor(theme.textColor) || !isValidColor(theme.backgroundColor) ||
            !availableFonts.includes(theme.font) || !availableWallpapers.includes(theme.wallpaper) ||
            !theme.assignmentColors ||
            !isValidColor(theme.assignmentColors.assignment) ||
            !isValidColor(theme.assignmentColors.quiz) ||
            !isValidColor(theme.assignmentColors.exam)) {
            return;
        }
        classThemes.set(classCode, {
            textColor: theme.textColor,
            backgroundColor: theme.backgroundColor,
            font: theme.font,
            wallpaper: theme.wallpaper,
            assignmentColors: {
                assignment: theme.assignmentColors.assignment,
                quiz: theme.assignmentColors.quiz,
                exam: theme.assignmentColors.exam
            }
        });
    });
}

async function initializeApp() {
    try {
        showStorageStatus("Connecting to the local SQL database…");
        const databaseData = await requestAppData("GET");
        const appData = await migrateBrowserData(databaseData);
        restoreAppData(appData);
        refreshEventClassOptions();
        document.body.classList.remove("app-loading");
        if (numClasses > 0) {
            introDiv.style.display = "none";
            appTitle.style.display = "";
            mainDiv.style.display = "block";
            classes.style.display = "block";
        } else {
            document.body.classList.add("welcome-screen");
        }
        showStorageStatus("");
    } catch (error) {
        console.error("Unable to initialize CourseTracker.", error);
        document.body.classList.remove("app-loading");
        document.body.classList.add("welcome-screen");
        introDiv.style.display = "grid";
        startBtn.disabled = true;
        startBtn.textContent = "Database unavailable";
        showStorageStatus(`Cannot connect to the local SQL backend: ${error.message} Start it with /usr/bin/python3 server.py, then reload this page.`);
    }
}

function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function renderCalendar() {
    const year = displayedMonth.getFullYear();
    const month = displayedMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;

    calendarMonth.textContent = displayedMonth.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric"
    });
    calendarDays.replaceChildren();

    for (let i = 0; i < firstWeekday; i++) {
        const emptyDay = document.createElement("li");
        emptyDay.className = "empty";
        emptyDay.setAttribute("aria-hidden", "true");
        calendarDays.appendChild(emptyDay);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dayCell = document.createElement("li");
        const dayEvents = events.filter((event) => event.date === date);
        const weekday = (firstWeekday + day - 1) % 7;
        dayCell.className = weekday >= 5 ? "weekend" : "";
        dayCell.tabIndex = 0;
        dayCell.setAttribute("aria-label", `${new Date(year, month, day).toLocaleDateString()}, ${dayEvents.length} events`);

        const dayNumber = document.createElement("span");
        dayNumber.className = "day-number";
        dayNumber.textContent = day;
        dayCell.appendChild(dayNumber);

        if (dayEvents.length > 0) {
            const eventCount = document.createElement("span");
            eventCount.className = "event-count";
            eventCount.textContent = `${dayEvents.length} ${dayEvents.length === 1 ? "event" : "events"}`;
            dayCell.appendChild(eventCount);

            const eventList = document.createElement("ul");
            eventList.className = "day-events";
            eventList.setAttribute("aria-label", `Events on ${new Date(year, month, day).toLocaleDateString()}`);
            dayEvents.forEach((event) => {
                const eventItem = document.createElement("li");
                eventItem.className = "day-event";
                eventItem.textContent = event.time ? `${event.name} · ${event.time}` : event.name;
                eventList.appendChild(eventItem);
            });
            dayCell.appendChild(eventList);
        }

        calendarDays.appendChild(dayCell);
    }
}

function setClassTab(activeButton, activePanel) {
    const isCalendar = activePanel === calendarPanel;
    classCalendarBtn.classList.toggle("active", isCalendar);
    classCalendarBtn.setAttribute("aria-selected", String(isCalendar));
    classAssignmentBtn.classList.toggle("active", !isCalendar);
    classAssignmentBtn.setAttribute("aria-selected", String(!isCalendar));
    calendarPanel.hidden = !isCalendar;
    assignmentPanel.hidden = isCalendar;
    activeButton.focus();
}

function renderClassEvents() {
    const upcomingEvents = events
        .filter((event) => event.classCode === activeClassCode && event.date >= getLocalDateString())
        .sort((first, second) => `${first.date} ${first.time}`.localeCompare(`${second.date} ${second.time}`));

    classEventList.replaceChildren();
    if (upcomingEvents.length === 0) {
        const emptyMessage = document.createElement("li");
        emptyMessage.className = "empty-message";
        emptyMessage.textContent = "No upcoming events for this class.";
        classEventList.appendChild(emptyMessage);
        return;
    }

    upcomingEvents.forEach((event) => {
        const item = document.createElement("li");
        const date = new Date(`${event.date}T00:00:00`).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric"
        });
        item.textContent = `${date}${event.time ? ` · ${event.time}` : ""} — ${event.name}`;
        classEventList.appendChild(item);
    });
}

function renderClassAssignments() {
    const classAssignments = assignments.filter((assignment) => assignment.classCode === activeClassCode);
    classAssignmentList.replaceChildren();
    if (classAssignments.length === 0) {
        const emptyMessage = document.createElement("li");
        emptyMessage.className = "empty-message";
        emptyMessage.textContent = "No assignments added for this class yet.";
        classAssignmentList.appendChild(emptyMessage);
        overallGrade.textContent = "—";
        overallGradeDetail.textContent = "Add graded assignments to calculate your weighted average.";
        return;
    }

    const totalWeight = classAssignments.reduce((total, assignment) => total + assignment.weight, 0);
    const weightedPoints = classAssignments.reduce((total, assignment) => total + assignment.grade * assignment.weight, 0);
    const weightedAverage = weightedPoints / totalWeight;
    overallGrade.textContent = `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(weightedAverage)}%`;
    overallGradeDetail.textContent = `Weighted average across ${classAssignments.length} ${classAssignments.length === 1 ? "assignment" : "assignments"} (${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(totalWeight)}% combined weight).`;

    classAssignments.forEach((assignment) => {
        const item = document.createElement("li");
        const name = document.createElement("span");
        name.className = "record-name";
        name.textContent = assignment.name;
        const grade = document.createElement("span");
        grade.className = "record-grade";
        grade.textContent = `${assignment.grade}%`;
        const weight = document.createElement("span");
        weight.className = "record-weight";
        weight.textContent = `${assignment.weight}% weight`;
        const category = document.createElement("span");
        category.className = `assignment-category assignment-category-${assignment.type}`;
        category.textContent = assignment.type;
        category.style.setProperty("--category-color", getClassTheme(activeClassCode).assignmentColors[assignment.type]);
        item.append(name, category, grade, weight);
        classAssignmentList.appendChild(item);
    });
}

function getClassTheme(classCode) {
    if (!classThemes.has(classCode)) {
        classThemes.set(classCode, {
            ...defaultClassTheme,
            assignmentColors: { ...defaultClassTheme.assignmentColors }
        });
    }
    return classThemes.get(classCode);
}

function applyClassTheme(theme) {
    document.body.style.setProperty("--ink", theme.textColor);
    document.body.style.setProperty("--page-bg", theme.backgroundColor);
    document.body.style.setProperty("--app-font", theme.font);
    document.body.dataset.wallpaper = theme.wallpaper;
    classAssignmentList.querySelectorAll(".assignment-category").forEach((badge) => {
        const type = badge.textContent;
        badge.style.setProperty("--category-color", theme.assignmentColors[type]);
    });
}

function resetClassTheme() {
    document.body.style.removeProperty("--ink");
    document.body.style.removeProperty("--page-bg");
    document.body.style.removeProperty("--app-font");
    delete document.body.dataset.wallpaper;
}

function updateThemePreview() {
    applyClassTheme({
        textColor: themeTextColorInput.value,
        backgroundColor: themeBackgroundColorInput.value,
        font: themeFontInput.value,
        wallpaper: themeWallpaperInput.value,
        assignmentColors: {
            assignment: themeAssignmentColorInput.value,
            quiz: themeQuizColorInput.value,
            exam: themeExamColorInput.value
        }
    });
}

function loadThemeControls(theme) {
    themeTextColorInput.value = theme.textColor;
    themeBackgroundColorInput.value = theme.backgroundColor;
    themeFontInput.value = theme.font;
    themeWallpaperInput.value = theme.wallpaper;
    themeAssignmentColorInput.value = theme.assignmentColors.assignment;
    themeQuizColorInput.value = theme.assignmentColors.quiz;
    themeExamColorInput.value = theme.assignmentColors.exam;
}

function refreshEventClassOptions() {
    const selectedClassCode = eventClassInput.value;
    eventClassInput.replaceChildren(new Option("Choose a class", ""));
    Array.from(classTable.rows).forEach((row) => {
        const option = new Option(row.querySelector("button").textContent, row.id);
        eventClassInput.appendChild(option);
    });
    eventClassInput.value = selectedClassCode;
}

initializeApp();

//from intro screen to main screen
startBtn.addEventListener("click", ()=>{
    document.body.classList.remove("welcome-screen");
    mainDiv.style.display = 'block';
    introDiv.style.display = 'none';
    appTitle.style.display = '';
    addClassDiv.style.display = 'none';
    classes.style.display = numClasses > 0 ? 'block' : 'none';
})

addClassBtn.addEventListener("click", ()=>{
    mainDiv.style.display = 'none';
    classes.style.display = 'none';
    addClassDiv.style.display = 'block';

});

addEventBtn.addEventListener("click", ()=>{
    refreshEventClassOptions();
    if (eventClassInput.options.length <= 1) {
        alert("Add a class before creating a class event.");
        return;
    }
    mainDiv.style.display = 'none';
    classes.style.display = 'none';
    addEventDiv.style.display = 'block';
});

submitEventBtn.addEventListener("click", ()=>{
    const name = eventNameInput.value.trim();
    const date = eventDateInput.value;
    const classCode = eventClassInput.value;
    if (!name || !date || !classCode) {
        alert("Please enter an event name, date, and class.");
        return;
    }

    events.push({
        name,
        date,
        time: eventTimeInput.value.trim(),
        classCode
    });
    saveAppData();
    const [year, month] = date.split("-").map(Number);
    displayedMonth = new Date(year, month - 1, 1);
    renderCalendar();

    addEventDiv.style.display = 'none';
    mainDiv.style.display = 'none';
    classes.style.display = 'none';
    mainCalendarDiv.style.display = 'block';
    eventNameInput.value = "";
    eventDateInput.value = "";
    eventTimeInput.value = "";
    eventClassInput.value = "";
});

submitClassBtn.addEventListener("click", ()=>{
    const classCode = document.getElementById("class-code").value.trim();
    const className = document.getElementById("class-name").value.trim();
    if (numClasses >= 8) {
        alert("You have reached the maximum number of classes.");
        return;
    }
    if (!classCode || !className) {
        alert("Please fill out all fields.");
        return;
    }
    if (Array.from(classTable.rows).some((row) => row.id === classCode)) {
        alert("A class with this code already exists.");
        return;
    }

    classTable.appendChild(createClassRow(classCode, className));
    numClasses++;
    saveAppData();
    refreshEventClassOptions();
    document.getElementById("class-code").value = "";
    document.getElementById("class-name").value = "";

    mainDiv.style.display = 'block';
    addClassDiv.style.display = 'none';
    classes.style.display = 'block';
})

//array of classes, from main to class screen
classTable.addEventListener("click", (event)=>{
    const button = event.target.closest(".class-button");
    if (!button) return;

    const courseName = button.textContent.trim();
    activeClassCode = button.closest("tr").id;
    classHeader.textContent = courseName;
    applyClassTheme(getClassTheme(activeClassCode));
    renderClassEvents();
    renderClassAssignments();
    setClassTab(classAssignmentBtn, assignmentPanel);

    classDiv.style.display = 'block';
    appTitle.style.display = 'none';
    mainDiv.style.display = 'none';
    classes.style.display = 'none';
}); 

classFormBackBtn.addEventListener("click", ()=>{
    mainDiv.style.display = 'block';
    addClassDiv.style.display = 'none';
    classes.style.display = 'block';

}) 

eventFormBackBtn.addEventListener("click", ()=>{
    mainDiv.style.display = 'block';
    addEventDiv.style.display = 'none';
    classes.style.display = 'block';
})

//from main screen to main calendar screen
mainCalendarBtn.addEventListener("click", ()=>{
    renderCalendar();
    mainCalendarDiv.style.display = 'block';
    mainDiv.style.display = 'none';
    classes.style.display = 'none';
})

previousMonthBtn.addEventListener("click", () => {
    displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);
    renderCalendar();
});

nextMonthBtn.addEventListener("click", () => {
    displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
    renderCalendar();
});

//from main calendar screen to main screen
calendarBackBtn.addEventListener("click", ()=>{
    mainDiv.style.display = 'block';
    mainCalendarDiv.style.display = 'none';
    classes.style.display = 'block';
})

//from class screen to main screen
classBackBtn.addEventListener("click", ()=>{
    mainDiv.style.display = 'block';
    classDiv.style.display = 'none';
    resetClassTheme();
    appTitle.style.display = '';
    classes.style.display = 'block';
})

//editing a class
editClassBtn.addEventListener("click", ()=>{
    themeBeforeEdit = getClassTheme(activeClassCode);
    loadThemeControls(themeBeforeEdit);
    appearanceDialog.showModal();
});

appearanceForm.addEventListener("input", updateThemePreview);
appearanceForm.addEventListener("change", updateThemePreview);
appearanceForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const theme = {
        textColor: themeTextColorInput.value,
        backgroundColor: themeBackgroundColorInput.value,
        font: themeFontInput.value,
        wallpaper: themeWallpaperInput.value,
        assignmentColors: {
            assignment: themeAssignmentColorInput.value,
            quiz: themeQuizColorInput.value,
            exam: themeExamColorInput.value
        }
    };
    classThemes.set(activeClassCode, theme);
    applyClassTheme(theme);
    renderClassAssignments();
    saveAppData();
    appearanceDialog.close();
});

function cancelThemePreview() {
    if (themeBeforeEdit) {
        applyClassTheme(themeBeforeEdit);
        themeBeforeEdit = undefined;
    }
}

appearanceCancelBtn.addEventListener("click", () => {
    cancelThemePreview();
    appearanceDialog.close();
});

appearanceCloseBtn.addEventListener("click", () => {
    cancelThemePreview();
    appearanceDialog.close();
});

appearanceDialog.addEventListener("cancel", cancelThemePreview);

//looking at the calendar for a class
classCalendarBtn.addEventListener("click", ()=>{
    setClassTab(classCalendarBtn, calendarPanel);
});

classAssignmentBtn.addEventListener("click", ()=>{
    setClassTab(classAssignmentBtn, assignmentPanel);
});

assignmentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = assignmentNameInput.value.trim();
    const grade = assignmentGradeInput.valueAsNumber;
    const weight = assignmentWeightInput.valueAsNumber;
    const type = assignmentTypeInput.value;
    if (!name || !Number.isFinite(grade) || grade < 0 || grade > 100 ||
        !Number.isFinite(weight) || weight <= 0 || weight > 100 ||
        !["assignment", "quiz", "exam"].includes(type)) {
        alert("Enter an assignment name, a grade from 0 to 100, a weight greater than 0 up to 100, and an assignment type.");
        return;
    }

    assignments.push({ classCode: activeClassCode, name, grade, weight, type });
    renderClassAssignments();
    saveAppData();
    assignmentForm.reset();
});
