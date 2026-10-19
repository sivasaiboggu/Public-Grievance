import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image as RNImage,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import {
  FileText,
  PlusCircle,
  Search,
  User,
  ShieldCheck,
  Settings,
  MapPin,
  Camera,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  LogOut,
  ArrowLeft,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FolderCheck,
  Users,
} from "lucide-react-native";
import {
  ApiError,
  createClient,
  transitions,
  type Auth,
  type Category,
  type Detail,
  type Page,
  type Status,
  type Config,
  getTimeOfDayGreeting,
  displayName,
} from "@grievancegrid/api-client";
import {
  colors,
  PLAIN_STATUS_LABELS,
  STATUS_DOT_COLORS,
  PLAIN_ROLE_LABELS,
  cleanAreaName,
  formatFullDate,
  formatRelativeTime,
  CONCURRENCY_CONFLICT_MESSAGE,
} from "./theme";

const baseUrl = process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:8000";
const initialPage: Page = { items: [], total: 0, offset: 0, limit: 25 };
const AUTH_STORE_KEY = "gg_mobile_auth_session";

type TabId =
  | "citizen_reports"
  | "citizen_new"
  | "citizen_track"
  | "citizen_profile"
  | "gro_reports"
  | "gro_track"
  | "gro_profile"
  | "field_work"
  | "field_profile"
  | "senior_overview"
  | "senior_profile"
  | "admin_config"
  | "admin_profile";

const CATEGORIES: { id: Category; label: string; desc: string; targetDays: number; tag?: string }[] = [
  {
    id: "road_damage",
    label: "Road damage",
    desc: "Potholes, cracks, broken edges.",
    targetDays: 2,
  },
  {
    id: "garbage",
    label: "Garbage",
    desc: "Overflowing bins, dumping.",
    targetDays: 1,
  },
  {
    id: "waterlogging",
    label: "Waterlogging",
    desc: "Water standing on the road.",
    targetDays: 2,
  },
  {
    id: "open_drain",
    label: "Manhole or open drain",
    desc: "Missing or broken manhole covers, open drains.",
    targetDays: 1,
  },
];

const FILTER_OPTIONS: { id: Status | ""; label: string }[] = [
  { id: "", label: "All reports" },
  { id: "submitted", label: "Received" },
  { id: "under_review", label: "Being reviewed" },
  { id: "in_progress", label: "Work started" },
  { id: "resolved", label: "Fixed" },
  { id: "rejected", label: "Not accepted" },
];

const DEMO_ACCOUNTS = [
  { label: "Citizen (Aarav Sharma)", email: "citizen@grievancegrid.test", pass: "Citizen@12345" },
  { label: "Officer (Priya Patel)", email: "officer@grievancegrid.test", pass: "Officer@12345" },
  { label: "Field worker (Rajesh Kumar)", email: "field@grievancegrid.test", pass: "Field@12345" },
  { label: "Senior authority (S. Ramanathan)", email: "senior@grievancegrid.test", pass: "Senior@12345" },
  { label: "Admin (System Administrator)", email: "admin@grievancegrid.test", pass: "Admin@12345" },
];

const MOBILE_SLIDES = [
  {
    image: require("./assets/slide-1-road-damage.jpg"),
    headline: "Report it. Track it. See it fixed.",
    support: "Potholes and broken roads fixed on a clear timeline.",
  },
  {
    image: require("./assets/slide-2-garbage.jpg"),
    headline: "Clean streets, documented every day.",
    support: "Track overflow reports from pickup to disposal.",
  },
  {
    image: require("./assets/slide-3-waterlogging.jpg"),
    headline: "Fast drainage response when monsoon hits.",
    support: "Monitored round the clock with senior alerts.",
  },
  {
    image: require("./assets/slide-4-manhole.jpg"),
    headline: "Safe footpaths and covered drains.",
    support: "Urgent hazards prioritized within 4 hours.",
  },
];

function getMobileSLAInfo(receivedAt: string, status: string, category: string) {
  const targets: Record<string, { firstResponse: number; fix: number }> = {
    road_damage: { firstResponse: 24, fix: 72 },
    garbage: { firstResponse: 12, fix: 48 },
    waterlogging: { firstResponse: 8, fix: 36 },
    manhole: { firstResponse: 4, fix: 12 },
    open_drain: { firstResponse: 4, fix: 12 },
  };
  const catSLA = targets[category] || { firstResponse: 24, fix: 48 };
  const rcv = new Date(receivedAt).getTime();
  const now = Date.now();
  const elapsedHours = Math.max(0, (now - rcv) / (1000 * 60 * 60));

  const isResolved = status === "resolved" || status === "rejected";
  const isReviewed = status !== "submitted";

  const firstResponseRemaining = Math.round(catSLA.firstResponse - elapsedHours);
  const fixRemaining = Math.round(catSLA.fix - elapsedHours);

  return {
    firstResponseText: isReviewed
      ? "First response completed"
      : firstResponseRemaining > 0
      ? `Review due in ${firstResponseRemaining}h`
      : `Review overdue by ${Math.abs(firstResponseRemaining)}h`,
    fixText: isResolved
      ? "Work completed"
      : fixRemaining > 0
      ? `Fix due in ${fixRemaining}h`
      : `Fix overdue by ${Math.abs(fixRemaining)}h`,
    isOverdue: (!isReviewed && firstResponseRemaining < 0) || (!isResolved && fixRemaining < 0),
  };
}

class MobileErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.error("Mobile error boundary caught:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPage, justifyContent: "center", alignItems: "center", padding: 24 }}>
          <AlertCircle size={40} color={colors.textMuted} />
          <Text style={{ fontSize: 18, fontWeight: "600", color: colors.textInk, marginTop: 16, marginBottom: 8, textAlign: "center" }}>
            Something went wrong on this screen
          </Text>
          <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: "center", marginBottom: 24 }}>
            We encountered an unexpected problem. Please restart the app or try again.
          </Text>
          <Pressable
            onPress={() => this.setState({ hasError: false })}
            style={{ backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 6 }}
          >
            <Text style={{ color: "#ffffff", fontWeight: "600", fontSize: 14 }}>Try again</Text>
          </Pressable>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <MobileErrorBoundary>
      <AppContent />
    </MobileErrorBoundary>
  );
}

function AppContent() {
  // Session State
  const [auth, setAuth] = useState<Auth | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  // Auth Form State
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [showDevMenu, setShowDevMenu] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    if (auth) return;
    const timer = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % MOBILE_SLIDES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [auth]);

  const [fieldWorkers, setFieldWorkers] = useState<any[]>([]);
  const [assignSheetOpen, setAssignSheetOpen] = useState(false);
  const [assigningWorker, setAssigningWorker] = useState(false);

  const loadFieldWorkers = useCallback(async () => {
    if (!auth?.access_token) return;
    try {
      const res = await fetch(`${baseUrl}/api/v1/officers/field-workers`, {
        headers: { Authorization: `Bearer ${auth.access_token}` },
      });
      if (res.ok) {
        setFieldWorkers(await res.json());
      }
    } catch {
      // Ignored
    }
  }, [auth, baseUrl]);

  const handleAssignWorker = async (workerId: string) => {
    if (!selected || !auth?.access_token) return;
    setAssigningWorker(true);
    try {
      const res = await fetch(`${baseUrl}/api/v1/complaints/${selected.tracking_id}/assign`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ assigned_to_id: workerId }),
      });
      if (res.ok) {
        setSuccessBanner("Field worker assigned.");
        await handleOpenDetail(selected.tracking_id);
        setAssignSheetOpen(false);
      } else {
        setErrorBanner("Could not assign field worker.");
      }
    } catch {
      setErrorBanner("Network error while assigning worker.");
    } finally {
      setAssigningWorker(false);
    }
  };

  // Active Tab
  const [activeTab, setActiveTab] = useState<TabId>("citizen_reports");

  // Notifications
  const [errorBanner, setErrorBanner] = useState("");
  const [successBanner, setSuccessBanner] = useState("");

  // Municipal Config
  const [config, setConfig] = useState<Config | null>(null);

  // Reports & Detail
  const [page, setPage] = useState<Page>(initialPage);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [queueFilter, setQueueFilter] = useState<Status | "">("");
  const [searchQuery, setSearchQuery] = useState("");

  // Quick Tracking Lookup
  const [trackingInput, setTrackingInput] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);

  // Citizen Stepper
  const [step, setStep] = useState(1);
  const [reportCategory, setReportCategory] = useState<Category>("road_damage");
  const [reportTitle, setReportTitle] = useState("");
  const [reportDesc, setReportDesc] = useState("");
  const [reportLandmark, setReportLandmark] = useState("");
  const [reportLat, setReportLat] = useState("");
  const [reportLng, setReportLng] = useState("");
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationSource, setLocationSource] = useState<"manual" | "device">("manual");
  const [reportPhoto, setReportPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateStatus, setLocateStatus] = useState("");
  const [showManualCoords, setShowManualCoords] = useState(false);
  const [submittingReport, setSubmittingReport] = useState(false);
  const retryId = useRef("");

  // Officer Decision State
  const [nextStatus, setNextStatus] = useState<Status>("under_review");
  const [officerNote, setOfficerNote] = useState("");
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);

  // Photo upload in detail
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Keyboard tracking (Expo Go compatible)
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setIsKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Field tasks
  const [fieldTasks, setFieldTasks] = useState<any[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const loadFieldTasks = useCallback(async (token?: string) => {
    const authToken = token || auth?.access_token;
    if (!authToken) return;
    setLoadingTasks(true);
    try {
      const res = await fetch(`${baseUrl}/assignments/my-tasks`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setFieldTasks(data);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingTasks(false);
    }
  }, [auth]);

  useEffect(() => {
    if (auth?.user.role === "field_officer") {
      loadFieldTasks();
    }
  }, [auth, loadFieldTasks]);

  const client = useMemo(() => createClient(baseUrl, auth?.access_token), [auth]);

  const setDefaultTabForRole = useCallback((userRole: string) => {
    switch (userRole) {
      case "gro":
        setActiveTab("gro_reports");
        break;
      case "field_officer":
        setActiveTab("field_work");
        break;
      case "supervisor":
        setActiveTab("senior_overview");
        break;
      case "admin":
        setActiveTab("admin_config");
        break;
      case "citizen":
      default:
        setActiveTab("citizen_reports");
        break;
    }
  }, []);

  // Load persisted session on app mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(AUTH_STORE_KEY);
        if (stored) {
          const parsed: Auth = JSON.parse(stored);
          setAuth(parsed);
          setDefaultTabForRole(parsed.user.role);
        }
      } catch {
        /* Fall back cleanly */
      } finally {
        setSessionLoading(false);
      }
    })();
  }, [setDefaultTabForRole]);

  const handleSignOut = useCallback(async () => {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    await SecureStore.deleteItemAsync(AUTH_STORE_KEY);
    setAuth(null);
    setSelected(null);
    setPage(initialPage);
    setActiveTab("citizen_reports");
    setErrorBanner("");
    setSuccessBanner("");
  }, [client]);

  const handleError = useCallback((e: unknown) => {
    const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "An unexpected error occurred.";
    setErrorBanner(msg);
    if (e instanceof ApiError && e.status === 401) {
      handleSignOut();
    }
  }, [handleSignOut]);

  // Load config
  const loadConfig = useCallback(async () => {
    try {
      const cfg = await client.config();
      setConfig(cfg);
    } catch {
      /* Ignore quiet config load failure */
    }
  }, [client]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Load reports list
  const loadComplaints = useCallback(
    async (offset = 0) => {
      if (!auth) return;
      setLoadingList(true);
      setErrorBanner("");
      try {
        const res = await client.list(offset, queueFilter || undefined);
        setPage(res);
      } catch (e: unknown) {
        if (auth.user.role === "supervisor" || auth.user.role === "field_officer") {
          // Expected 403 for supervisor and field worker in this milestone
        } else {
          handleError(e);
        }
      } finally {
        setLoadingList(false);
      }
    },
    [auth, client, queueFilter, handleError]
  );

  useEffect(() => {
    if (auth && (activeTab === "citizen_reports" || activeTab === "gro_reports")) {
      loadComplaints();
    }
  }, [auth, activeTab, queueFilter, loadComplaints]);

  // Open detail view
  const handleOpenDetail = async (trackingId: string) => {
    setErrorBanner("");
    try {
      const res = await client.get(trackingId);
      setSelected(res);
      setOfficerNote("");
      const allowed = transitions[res.status] || [];
      if (allowed.length > 0) {
        setNextStatus(allowed[0]);
      }
    } catch (e) {
      handleError(e);
    }
  };

  const handleAuthSubmit = async () => {
    setErrorBanner("");
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorBanner("Please enter your email address.");
      return;
    }
    if (!password) {
      setErrorBanner("Please enter your password.");
      return;
    }
    if (isRegister) {
      if (name.trim().length < 2) {
        setErrorBanner("Please enter your full name.");
        return;
      }
      if (password.length < 12) {
        setErrorBanner("Password must be at least 12 characters.");
        return;
      }
    }

    setAuthBusy(true);
    try {
      if (isRegister) {
        await client.register(name.trim(), trimmedEmail, password);
      }
      const res = await client.login(trimmedEmail, password);
      await SecureStore.setItemAsync(AUTH_STORE_KEY, JSON.stringify(res));
      setAuth(res);
      setDefaultTabForRole(res.user.role);
      setName("");
      setEmail("");
      setPassword("");
      setSuccessBanner(isRegister ? "Account created successfully." : "Signed in.");
    } catch (e) {
      handleError(e);
    } finally {
      setAuthBusy(false);
    }
  };

  // Live Location Watch (high accuracy until accuracy <= 30m or 10s timeout)
  const handleGetLocation = async () => {
    setErrorBanner("");
    setLocateStatus("Finding you…");
    setLocating(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorBanner("Location access was denied. You can enter a street address or coordinates manually.");
        setLocating(false);
        return;
      }

      let sub: Location.LocationSubscription | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const stopSub = () => {
        if (sub) {
          sub.remove();
          sub = null;
        }
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        setLocating(false);
      };

      timer = setTimeout(() => {
        stopSub();
        setLocateStatus("Location updated.");
      }, 10000);

      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 500,
          distanceInterval: 1,
        },
        async (loc) => {
          const lat = loc.coords.latitude;
          const lng = loc.coords.longitude;
          const acc = Math.round(loc.coords.accuracy ?? 50);

          setReportLat(lat.toFixed(6));
          setReportLng(lng.toFixed(6));
          setLocationAccuracy(acc);
          setLocationSource("device");

          if (acc <= 30) {
            setLocateStatus(`Location found, accurate to about ${acc} m.`);
            stopSub();
          } else {
            setLocateStatus(`Finding you… ±${acc} m`);
          }

          // Reverse geocode street name if missing
          if (!reportLandmark.trim()) {
            try {
              const geocoded = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
              if (geocoded.length > 0) {
                const g = geocoded[0];
                const street = [g.streetNumber, g.street, g.district || g.subregion || g.city]
                  .filter(Boolean)
                  .join(" ");
                if (street) setReportLandmark(street);
              }
            } catch {
              /* ignore */
            }
          }
        }
      );
    } catch (e) {
      setErrorBanner(e instanceof Error ? e.message : "Failed to acquire location.");
      setLocating(false);
    }
  };

  const handlePickPhoto = async (useCamera = false) => {
    try {
      let result: ImagePicker.ImagePickerResult;
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          setErrorBanner("Camera permission is needed to take a photo.");
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          quality: 0.8,
          mediaTypes: ["images"],
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          quality: 0.8,
          mediaTypes: ["images"],
        });
      }

      if (result.canceled || !result.assets.length) return;
      const asset = result.assets[0];
      setReportPhoto(asset);
    } catch {
      setErrorBanner("Could not select photo.");
    }
  };

  const handleSubmitReport = async () => {
    if (reportTitle.trim().length < 5) {
      setErrorBanner("Please enter a title of at least 5 characters.");
      return;
    }
    if (reportDesc.trim().length < 20) {
      setErrorBanner("Please describe the issue in at least 20 characters.");
      return;
    }
    if (reportLandmark.trim().length < 5) {
      setErrorBanner("Please specify a readable street or landmark name.");
      return;
    }
    const lat = Number(reportLat);
    const lng = Number(reportLng);
    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
      setErrorBanner("Please choose your location or tap 'Use my current location'.");
      return;
    }

    setSubmittingReport(true);
    setErrorBanner("");
    try {
      retryId.current ||= Crypto.randomUUID();
      const record = await client.submit({
        client_request_id: retryId.current,
        title: reportTitle.trim(),
        description: reportDesc.trim(),
        category: reportCategory,
        latitude: lat,
        longitude: lng,
        location_text: reportLandmark.trim(),
        location_source: locationSource,
      });

      retryId.current = "";
      setSuccessBanner(`Report submitted. Reference: ${record.tracking_id}`);

      // Reset Form
      setReportTitle("");
      setReportDesc("");
      setReportLandmark("");
      setReportLat("");
      setReportLng("");
      setLocationAccuracy(null);
      setStep(1);

      const photoAttachment = reportPhoto;
      setReportPhoto(null);

      // Upload photo if selected
      if (photoAttachment) {
        try {
          const form = new FormData();
          form.append("file", {
            uri: photoAttachment.uri,
            name: photoAttachment.fileName || "evidence.jpg",
            type: photoAttachment.mimeType || "image/jpeg",
          } as unknown as Blob);
          await client.upload(record.tracking_id, form);
        } catch {
          setErrorBanner("Report saved, but photo upload encountered an issue. You can add it later.");
        }
      }

      await loadComplaints();
      await handleOpenDetail(record.tracking_id);
    } catch (e) {
      handleError(e);
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleOfficerSaveDecision = async () => {
    if (!selected) return;
    if (officerNote.trim().length < 10) {
      setErrorBanner("Please provide a note for the resident of at least 10 characters.");
      return;
    }

    setDecisionSubmitting(true);
    setErrorBanner("");
    try {
      const updated = await client.update(selected.tracking_id, nextStatus, officerNote.trim(), selected.version);
      setSelected(updated);
      setOfficerNote("");
      setSuccessBanner(`Saved update for ${selected.tracking_id}.`);
      await loadComplaints(page.offset);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("409") || msg.toLowerCase().includes("changed") || msg.toLowerCase().includes("refresh")) {
        setErrorBanner(CONCURRENCY_CONFLICT_MESSAGE);
        await handleOpenDetail(selected.tracking_id);
      } else {
        handleError(e);
      }
    } finally {
      setDecisionSubmitting(false);
    }
  };

  const handleDetailPhotoUpload = async () => {
    if (!selected) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (result.canceled || !result.assets.length) return;
      const asset = result.assets[0];

      setUploadingPhoto(true);
      const form = new FormData();
      form.append("file", {
        uri: asset.uri,
        name: asset.fileName || "evidence.jpg",
        type: asset.mimeType || "image/jpeg",
      } as unknown as Blob);
      await client.upload(selected.tracking_id, form);
      setSuccessBanner("Photo added successfully.");
      await handleOpenDetail(selected.tracking_id);
    } catch (e) {
      handleError(e);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleTrackingLookup = async () => {
    if (!trackingInput.trim()) return;
    setLookupBusy(true);
    setErrorBanner("");
    try {
      await handleOpenDetail(trackingInput.trim().toUpperCase());
      setTrackingInput("");
    } catch {
      setErrorBanner(`No report found matching "${trackingInput.trim()}".`);
    } finally {
      setLookupBusy(false);
    }
  };

  if (sessionLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const filteredComplaints = searchQuery.trim()
    ? page.items.filter(
        (c) =>
          c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.tracking_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.location_text.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : page.items;

  const role = auth?.user.role;
  const isCitizenRole = role === "citizen";
  const areaName = config ? cleanAreaName(config.jurisdiction_name) : "Service Area";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.headerBrand}>
            <View style={styles.brandIcon}>
              <View style={styles.brandRow}>
                <View style={styles.brandSquare} />
                <View style={styles.brandSquare} />
              </View>
              <View style={styles.brandRow}>
                <View style={styles.brandSquare} />
                <View style={styles.brandSquare} />
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={styles.brandBold}>Grievance</Text>
              <Text style={styles.brandRegular}>Grid</Text>
            </View>
          </View>

          {auth && (
            <View style={styles.headerUser}>
              <Text style={styles.userRoleTag}>{PLAIN_ROLE_LABELS[auth.user.role] || auth.user.role}</Text>
            </View>
          )}
        </View>

        {/* Global Banners */}
        {!!errorBanner && (
          <Pressable onPress={() => setErrorBanner("")} style={styles.errorBanner}>
            <AlertCircle size={15} color={colors.error} />
            <Text style={styles.errorBannerText}>{errorBanner}</Text>
          </Pressable>
        )}
        {!!successBanner && (
          <Pressable onPress={() => setSuccessBanner("")} style={styles.successBanner}>
            <CheckCircle2 size={15} color={colors.success} />
            <Text style={styles.successBannerText}>{successBanner}</Text>
          </Pressable>
        )}

        {/* DETAIL VIEW OVERLAY */}
        {selected ? (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Pressable onPress={() => setSelected(null)} style={styles.backButton}>
              <ArrowLeft size={16} color={colors.primary} />
              <Text style={styles.backButtonText}>Back to list</Text>
            </Pressable>

            {/* Single white surface with dividers */}
            <View style={styles.card}>
              <View style={styles.detailHeaderRow}>
                <Text style={styles.trackingCode}>{selected.tracking_id}</Text>
                <View style={styles.statusChip}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: STATUS_DOT_COLORS[selected.status] || colors.textMuted },
                    ]}
                  />
                  <Text style={styles.statusLabelText}>{PLAIN_STATUS_LABELS[selected.status] || selected.status}</Text>
                </View>
              </View>

              <Text style={styles.detailTitle}>{selected.title}</Text>
              <Text style={styles.detailDescription}>{selected.description}</Text>

              {/* SLA Response & Resolution Clock */}
              {(() => {
                const sla = getMobileSLAInfo(selected.received_at, selected.status, selected.category);
                return (
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      backgroundColor: sla.isOverdue ? "#fff7ed" : colors.bgSubtle,
                      borderWidth: 1,
                      borderColor: sla.isOverdue ? "#fdba74" : colors.border,
                      borderRadius: 6,
                      padding: 10,
                      marginTop: 10,
                      marginBottom: 6,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: "500" }}>First response</Text>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: sla.firstResponseText.includes("overdue") ? "#c2540a" : colors.textInk,
                          marginTop: 2,
                        }}
                      >
                        {sla.firstResponseText}
                      </Text>
                    </View>
                    <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: 10 }}>
                      <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: "500" }}>Fix target</Text>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: sla.fixText.includes("overdue") ? "#c2540a" : colors.textInk,
                          marginTop: 2,
                        }}
                      >
                        {sla.fixText}
                      </Text>
                    </View>
                  </View>
                );
              })()}

              {/* Location details */}
              <View style={[styles.detailMetaRow, { flexDirection: "column", gap: 6, alignItems: "flex-start" }]}>
                <View style={styles.metaItem}>
                  <MapPin size={14} color={colors.textMuted} />
                  <Text style={[styles.metaText, { fontWeight: "500", color: colors.textInk }]}>
                    {selected.location_text}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaText}>
                    {selected.latitude.toFixed(4)}° N, {selected.longitude.toFixed(4)}° E · from {selected.location_source === "device" ? "device" : "map"}
                  </Text>
                </View>
                <Pressable
                  onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${selected.latitude},${selected.longitude}`)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}
                >
                  <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "500" }}>Open in Maps</Text>
                  <ExternalLink size={12} color={colors.primary} />
                </Pressable>
              </View>

              {/* Why this order */}
              <View style={styles.priorityBox}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textInk, marginBottom: 4 }}>
                  Why this order
                </Text>
                <Text style={{ fontSize: 12, color: colors.textMuted, lineHeight: 17 }}>
                  Location is on the map
                </Text>
                <Text style={{ fontSize: 12, color: colors.textMuted, lineHeight: 17 }}>
                  {selected.evidence?.length ? (selected.evidence.length === 1 ? "1 photo attached" : `${selected.evidence.length} photos attached`) : "No photos attached"}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textMuted, lineHeight: 17 }}>
                  Not yet checked on site
                </Text>
              </View>

              {/* Updates Timeline */}
              <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 16, marginTop: 16 }}>
                <Text style={styles.sectionHeading}>Updates</Text>
                {selected.events && selected.events.length > 0 ? (
                  selected.events.map((ev, idx) => (
                    <View key={ev.id || idx} style={styles.timelineItem}>
                      <View style={styles.timelineDot} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text style={styles.timelineStatus}>{PLAIN_STATUS_LABELS[ev.status] || ev.status}</Text>
                          <Text style={styles.timelineDate}>{formatFullDate(ev.created_at)}</Text>
                        </View>
                        <Text style={styles.timelineNote}>{ev.note}</Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.mutedNotice}>Report received. Awaiting review.</Text>
                )}
              </View>

              {/* Photos Section */}
              <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 16, marginTop: 16 }}>
                <Text style={styles.sectionHeading}>Photos</Text>
                {selected.evidence && selected.evidence.length > 0 ? (
                  <View style={{ gap: 8, marginBottom: 12 }}>
                    {selected.evidence.map((item, idx) => (
                      <View key={item.id || idx} style={styles.evidenceItem}>
                        <Text style={styles.evidenceText}>
                          Photo #{idx + 1} ({(item.size_bytes / 1024).toFixed(0)} KB)
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.mutedNotice, { marginBottom: 12 }]}>No photo attached to this report.</Text>
                )}

                {role === "citizen" && selected.status !== "resolved" && selected.status !== "rejected" && (
                  <Pressable
                    onPress={handleDetailPhotoUpload}
                    disabled={uploadingPhoto}
                    style={styles.secondaryButton}
                  >
                    <Camera size={16} color={colors.textInk} />
                    <Text style={styles.secondaryButtonText}>
                      {uploadingPhoto ? "Adding photo…" : "Add a photo"}
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Officer Status Transition Form */}
              {role === "gro" && transitions[selected.status]?.length > 0 && (
                <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 16, marginTop: 16 }}>
                  <Text style={styles.sectionHeading}>Change status to</Text>
                  <View style={styles.choiceGroup}>
                    {transitions[selected.status].map((st) => (
                      <Pressable
                        key={st}
                        onPress={() => setNextStatus(st)}
                        style={[styles.choiceBtn, nextStatus === st && styles.choiceBtnActive]}
                      >
                        <Text style={[styles.choiceBtnText, nextStatus === st && styles.choiceBtnTextActive]}>
                          {PLAIN_STATUS_LABELS[st] || st}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={[styles.inputLabel, { marginTop: 12 }]}>Note for the resident</Text>
                  <TextInput
                    value={officerNote}
                    onChangeText={setOfficerNote}
                    placeholder="Tell the resident what you found or did."
                    placeholderTextColor={colors.textMuted}
                    multiline
                    numberOfLines={3}
                    style={[styles.textInput, { height: 80, textAlignVertical: "top" }]}
                  />
                  <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
                    The resident will see this note.
                  </Text>

                  <Pressable
                    onPress={handleOfficerSaveDecision}
                    disabled={decisionSubmitting || officerNote.trim().length < 10}
                    style={[
                      styles.primaryButton,
                      (decisionSubmitting || officerNote.trim().length < 10) && styles.disabledButton,
                      { marginTop: 12 },
                    ]}
                  >
                    <Text style={styles.primaryButtonText}>
                      {decisionSubmitting ? "Saving update…" : "Save update"}
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* Officer Field Assignment */}
              {role === "gro" && (
                <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 16, marginTop: 16 }}>
                  <Text style={styles.sectionHeading}>Field assignment</Text>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                    <Text style={{ fontSize: 13, color: colors.textInk, flex: 1, marginRight: 8 }}>
                      {selected.assigned_worker_name
                        ? `Assigned to ${selected.assigned_worker_name}`
                        : "Not yet assigned to a field worker"}
                    </Text>
                    <Pressable
                      onPress={() => {
                        loadFieldWorkers();
                        setAssignSheetOpen((prev) => !prev);
                      }}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 4,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.bgSubtle,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}>
                        {selected.assigned_worker_name ? "Change" : "Assign worker"}
                      </Text>
                    </Pressable>
                  </View>

                  {/* Field worker picker list */}
                  {assignSheetOpen && (
                    <View style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 6, backgroundColor: colors.bgSubtle, padding: 8, gap: 6 }}>
                      {fieldWorkers.length === 0 ? (
                        <Text style={{ fontSize: 12, color: colors.textMuted, padding: 4 }}>Loading active workers…</Text>
                      ) : (
                        fieldWorkers.map((w: any) => (
                          <Pressable
                            key={w.id}
                            onPress={() => handleAssignWorker(w.id)}
                            disabled={assigningWorker}
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                              paddingVertical: 8,
                              paddingHorizontal: 10,
                              backgroundColor: colors.bgSurface,
                              borderRadius: 4,
                            }}
                          >
                            <View>
                              <Text style={{ fontSize: 13, fontWeight: "500", color: colors.textInk }}>{w.name}</Text>
                              <Text style={{ fontSize: 11, color: colors.textMuted }}>{w.team_name || "General Team"}</Text>
                            </View>
                            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}>
                              {selected.assigned_worker_id === w.id ? "Current" : "Assign"}
                            </Text>
                          </Pressable>
                        ))
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>
          </ScrollView>
        ) : !auth ? (
          /* AUTHENTICATION VIEW */
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {!isKeyboardVisible && (
              <View style={styles.authPhotoBand}>
                <RNImage
                  source={MOBILE_SLIDES[slideIndex].image}
                  style={styles.authPhotoImage}
                  resizeMode="cover"
                />
                <View style={styles.authPhotoOverlay} />
                <View style={styles.authPhotoTextWrap}>
                  <Text style={styles.authPhotoHeadline}>{MOBILE_SLIDES[slideIndex].headline}</Text>
                  <Text style={styles.authPhotoSupport}>
                    {MOBILE_SLIDES[slideIndex].support}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 10 }}>
                    {MOBILE_SLIDES.map((_, idx) => (
                      <Pressable
                        key={idx}
                        onPress={() => setSlideIndex(idx)}
                        style={{
                          width: idx === slideIndex ? 18 : 6,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: idx === slideIndex ? "#FFFFFF" : "rgba(255,255,255,0.4)",
                        }}
                      />
                    ))}
                  </View>
                </View>
              </View>
            )}

            <View style={styles.authCard}>
              <Text style={styles.authTitle}>
                {isRegister ? "Create an account" : "Sign in to GrievanceGrid"}
              </Text>
              <Text style={styles.authSubtitle}>
                {isRegister
                  ? "Sign up as a resident to submit and track local reports."
                  : "Access your active reports and official updates."}
              </Text>

              {isRegister && (
                <View style={{ marginBottom: 14 }}>
                  <Text style={styles.inputLabel}>Full name</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g. Maya Sharma"
                    placeholderTextColor={colors.textMuted}
                    style={styles.textInput}
                    autoCapitalize="words"
                  />
                </View>
              )}

              <View style={{ marginBottom: 14 }}>
                <Text style={styles.inputLabel}>Email address</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.textInput}
                />
              </View>

              <View style={{ marginBottom: 18 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                  <Text style={styles.inputLabel}>Password</Text>
                  {isRegister && (
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>At least 12 characters</Text>
                  )}
                </View>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder={isRegister ? "Choose a secure password" : "Enter your password"}
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  style={styles.textInput}
                />
              </View>

              <Pressable
                onPress={handleAuthSubmit}
                disabled={authBusy}
                style={[styles.primaryButton, authBusy && styles.disabledButton]}
              >
                <Text style={styles.primaryButtonText}>
                  {authBusy ? "Verifying…" : isRegister ? "Create account" : "Sign in"}
                </Text>
              </Pressable>

              {/* Quiet test account link in __DEV__ only */}
              {__DEV__ && !isRegister && (
                <View style={{ marginTop: 12, alignItems: "center" }}>
                  <Pressable onPress={() => setShowDevMenu((prev) => !prev)}>
                    <Text style={{ fontSize: 13, color: colors.textMuted, textDecorationLine: "underline" }}>
                      Use a test account
                    </Text>
                  </Pressable>

                  {showDevMenu && (
                    <View style={styles.testAccountBox}>
                      {DEMO_ACCOUNTS.map((acc) => (
                        <Pressable
                          key={acc.email}
                          onPress={() => {
                            setEmail(acc.email);
                            setPassword(acc.pass);
                            setShowDevMenu(false);
                          }}
                          style={styles.testAccountRow}
                        >
                          <Text style={{ fontSize: 13, fontWeight: "500", color: colors.textInk }}>{acc.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              )}

              <Pressable
                onPress={() => {
                  setIsRegister(!isRegister);
                  setErrorBanner("");
                }}
                style={styles.toggleAuthBtn}
              >
                <Text style={styles.toggleAuthText}>
                  {isRegister ? "Already registered? Sign in" : "New citizen? Create an account"}
                </Text>
              </Pressable>

              <View style={styles.emergencyFooter}>
                <Text style={styles.emergencyText}>
                  For emergencies, call your local emergency number.
                </Text>
              </View>
            </View>
          </ScrollView>
        ) : (
          /* AUTHENTICATED ROLE SCREENS */
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* CITIZEN REPORTS */}
            {role === "citizen" && activeTab === "citizen_reports" && (
              <>
                <View style={styles.pageHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.pageTitle}>
                      {auth?.user.name
                        ? `${getTimeOfDayGreeting()}, ${displayName(auth.user.name)}`
                        : "My reports"}
                    </Text>
                    <Text style={styles.pageSubtitle}>
                      {filteredComplaints.filter((c) => c.status !== "resolved" && c.status !== "rejected").length > 0
                        ? `${filteredComplaints.filter((c) => c.status !== "resolved" && c.status !== "rejected").length} open report${
                            filteredComplaints.filter((c) => c.status !== "resolved" && c.status !== "rejected").length === 1 ? "" : "s"
                          } being tracked`
                        : "You have no open reports right now."}
                    </Text>
                  </View>
                  <Pressable onPress={() => loadComplaints()} disabled={loadingList} style={styles.refreshIconBtn}>
                    <RefreshCw size={16} color={colors.textInk} />
                  </Pressable>
                </View>

                {filteredComplaints.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <FileText size={32} color={colors.textMuted} />
                    <Text style={styles.emptyTitle}>No reports yet</Text>
                    <Text style={styles.emptySubtitle}>When you report a problem, you&apos;ll see it here.</Text>
                    <Pressable onPress={() => setActiveTab("citizen_new")} style={[styles.primaryButton, { marginTop: 16 }]}>
                      <Text style={styles.primaryButtonText}>Report a problem</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    {filteredComplaints.map((item) => (
                      <Pressable key={item.id} onPress={() => handleOpenDetail(item.tracking_id)} style={styles.cardItem}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={styles.itemCode}>{item.tracking_id}</Text>
                          <View style={styles.statusChip}>
                            <View
                              style={[
                                styles.statusDot,
                                { backgroundColor: STATUS_DOT_COLORS[item.status] || colors.textMuted },
                              ]}
                            />
                            <Text style={styles.statusLabelText}>{PLAIN_STATUS_LABELS[item.status] || item.status}</Text>
                          </View>
                        </View>
                        <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                        <View style={styles.itemFooter}>
                          <Text style={styles.itemMeta} numberOfLines={1}>{item.location_text}</Text>
                          <Text style={styles.itemMeta}>{formatRelativeTime(item.received_at)}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}

            {/* CITIZEN NEW REPORT STEPPER */}
            {role === "citizen" && activeTab === "citizen_new" && (
              <View style={styles.card}>
                <View style={styles.stepperHeader}>
                  <Text style={styles.stepperStep}>Step {step} of 5</Text>
                  <Text style={styles.stepperTitle}>
                    {step === 1 && "Category"}
                    {step === 2 && "Details"}
                    {step === 3 && "Location"}
                    {step === 4 && "Photo"}
                    {step === 5 && "Review"}
                  </Text>
                </View>

                {/* Step 1: Category */}
                {step === 1 && (
                  <View style={{ gap: 8 }}>
                    {CATEGORIES.map((cat) => (
                      <Pressable
                        key={cat.id}
                        onPress={() => setReportCategory(cat.id)}
                        style={[styles.categoryOption, reportCategory === cat.id && styles.categoryOptionActive]}
                      >
                        <Text style={[styles.categoryTitle, reportCategory === cat.id && styles.categoryTitleActive]}>
                          {cat.label}
                        </Text>
                        <Text style={styles.categoryDesc}>{cat.desc}</Text>
                      </Pressable>
                    ))}
                    <Text style={styles.categoryNotice}>
                      We can only take these four kinds of problems for now. For anything else, please contact your local office.
                    </Text>
                    <Pressable onPress={() => setStep(2)} style={[styles.primaryButton, { marginTop: 12 }]}>
                      <Text style={styles.primaryButtonText}>Next</Text>
                    </Pressable>
                  </View>
                )}

                {/* Step 2: Details */}
                {step === 2 && (
                  <View style={{ gap: 12 }}>
                    <View>
                      <Text style={styles.inputLabel}>Short title</Text>
                      <TextInput
                        value={reportTitle}
                        onChangeText={setReportTitle}
                        placeholder="e.g. Deep pothole near main bus stop curb"
                        placeholderTextColor={colors.textMuted}
                        maxLength={160}
                        style={styles.textInput}
                      />
                    </View>
                    <View>
                      <Text style={styles.inputLabel}>Detailed description</Text>
                      <TextInput
                        value={reportDesc}
                        onChangeText={setReportDesc}
                        placeholder="Describe size, depth, or safety hazards observed..."
                        placeholderTextColor={colors.textMuted}
                        maxLength={2000}
                        multiline
                        numberOfLines={4}
                        style={[styles.textInput, { height: 90, textAlignVertical: "top" }]}
                      />
                    </View>
                    <View style={styles.stepperActions}>
                      <Pressable onPress={() => setStep(1)} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Back</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          if (reportTitle.trim().length < 5 || reportDesc.trim().length < 20) {
                            setErrorBanner("Please enter a title (5+ chars) and description (20+ chars).");
                            return;
                          }
                          setErrorBanner("");
                          setStep(3);
                        }}
                        style={styles.primaryButton}
                      >
                        <Text style={styles.primaryButtonText}>Next</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Step 3: Location */}
                {step === 3 && (
                  <View style={{ gap: 12 }}>
                    <Pressable onPress={handleGetLocation} disabled={locating} style={styles.primaryButton}>
                      <MapPin size={16} color="#FFFFFF" />
                      <Text style={styles.primaryButtonText}>
                        {locating ? "Finding your position…" : "Use my current location"}
                      </Text>
                    </Pressable>

                    {!!locateStatus && (
                      <Text style={{ fontSize: 13, color: colors.textInk, marginTop: 2 }}>
                        {locateStatus}
                      </Text>
                    )}

                    <View>
                      <Text style={styles.inputLabel}>Landmark or street (optional but helpful)</Text>
                      <TextInput
                        value={reportLandmark}
                        onChangeText={setReportLandmark}
                        placeholder="e.g. Near 4th Block Bus Stop, 14th Main Rd"
                        placeholderTextColor={colors.textMuted}
                        style={styles.textInput}
                      />
                    </View>

                    {/* Coordinates Indicator */}
                    {!!reportLat && !!reportLng && (
                      <View style={{ backgroundColor: colors.bgSubtle, padding: 10, borderRadius: 6 }}>
                        <Text style={{ fontSize: 12, color: colors.textInk }}>
                          Selected: {Number(reportLat).toFixed(4)}° N, {Number(reportLng).toFixed(4)}° E
                          {locationAccuracy ? ` (±${locationAccuracy} m)` : ""}
                        </Text>
                      </View>
                    )}

                    {/* Manual coordinates disclosure */}
                    <Pressable
                      onPress={() => setShowManualCoords((prev) => !prev)}
                      style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}
                    >
                      <Text style={{ fontSize: 13, color: colors.textMuted }}>Enter coordinates manually</Text>
                      {showManualCoords ? <ChevronUp size={14} color={colors.textMuted} /> : <ChevronDown size={14} color={colors.textMuted} />}
                    </Pressable>

                    {showManualCoords && (
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.inputLabel}>Latitude</Text>
                          <TextInput
                            value={reportLat}
                            onChangeText={(v) => {
                              setReportLat(v);
                              setLocationSource("manual");
                            }}
                            placeholder="e.g. 12.9716"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="numeric"
                            style={styles.textInput}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.inputLabel}>Longitude</Text>
                          <TextInput
                            value={reportLng}
                            onChangeText={(v) => {
                              setReportLng(v);
                              setLocationSource("manual");
                            }}
                            placeholder="e.g. 77.5946"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="numeric"
                            style={styles.textInput}
                          />
                        </View>
                      </View>
                    )}

                    <View style={styles.stepperActions}>
                      <Pressable onPress={() => setStep(2)} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Back</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          if (!reportLat.trim() || !reportLng.trim()) {
                            setErrorBanner("Please choose your location or tap 'Use my current location'.");
                            return;
                          }
                          if (!reportLandmark.trim()) {
                            setErrorBanner("Please enter a street or landmark name.");
                            return;
                          }
                          setErrorBanner("");
                          setStep(4);
                        }}
                        style={styles.primaryButton}
                      >
                        <Text style={styles.primaryButtonText}>Next</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Step 4: Photo */}
                {step === 4 && (
                  <View style={{ gap: 12 }}>
                    <View style={styles.safetyBox}>
                      <Text style={{ fontSize: 12, color: colors.textInk, lineHeight: 16 }}>
                        <Text style={{ fontWeight: "600" }}>Safety reminder:</Text> Only take photos when it&apos;s safe to stand there.
                      </Text>
                    </View>

                    {reportPhoto ? (
                      <View style={{ alignItems: "center", padding: 14, backgroundColor: colors.bgSubtle, borderRadius: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textInk, marginBottom: 8 }}>
                          Photo selected ({(reportPhoto.fileSize ? reportPhoto.fileSize / (1024 * 1024) : 0).toFixed(2)} MB)
                        </Text>
                        <Pressable onPress={() => setReportPhoto(null)}>
                          <Text style={{ color: colors.error, fontSize: 13 }}>Remove photo</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <View style={{ gap: 8 }}>
                        <Pressable onPress={() => handlePickPhoto(true)} style={styles.secondaryButton}>
                          <Camera size={16} color={colors.textInk} />
                          <Text style={styles.secondaryButtonText}>Take photo</Text>
                        </Pressable>
                        <Pressable onPress={() => handlePickPhoto(false)} style={styles.secondaryButton}>
                          <ImageIcon size={16} color={colors.textInk} />
                          <Text style={styles.secondaryButtonText}>Choose from gallery</Text>
                        </Pressable>
                      </View>
                    )}

                    <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
                      Photos are optional. You can skip this step if you don&apos;t have a photo.
                    </Text>

                    <View style={styles.stepperActions}>
                      <Pressable onPress={() => setStep(3)} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Back</Text>
                      </Pressable>
                      <Pressable onPress={() => setStep(5)} style={styles.primaryButton}>
                        <Text style={styles.primaryButtonText}>Next</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Step 5: Review */}
                {step === 5 && (
                  <View style={{ gap: 12 }}>
                    <View style={styles.reviewBox}>
                      <Text style={styles.reviewLabel}>Category</Text>
                      <Text style={styles.reviewValue}>{CATEGORIES.find((c) => c.id === reportCategory)?.label}</Text>

                      <Text style={styles.reviewLabel}>Title</Text>
                      <Text style={styles.reviewValue}>{reportTitle}</Text>

                      <Text style={styles.reviewLabel}>Location</Text>
                      <Text style={styles.reviewValue}>
                        {reportLandmark}
                        {"\n"}
                        <Text style={{ fontSize: 12, color: colors.textMuted }}>
                          {Number(reportLat).toFixed(4)}° N, {Number(reportLng).toFixed(4)}° E · from {locationSource}
                        </Text>
                      </Text>

                      <Text style={styles.reviewLabel}>Photo</Text>
                      <Text style={styles.reviewValue}>{reportPhoto ? "Photo attached" : "None added"}</Text>
                    </View>

                    <View style={styles.stepperActions}>
                      <Pressable onPress={() => setStep(4)} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Back</Text>
                      </Pressable>
                      <Pressable
                        onPress={handleSubmitReport}
                        disabled={submittingReport}
                        style={[styles.primaryButton, submittingReport && styles.disabledButton]}
                      >
                        <Text style={styles.primaryButtonText}>
                          {submittingReport ? "Submitting…" : "Submit report"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* TRACK BY REFERENCE */}
            {(activeTab === "citizen_track" || activeTab === "gro_track") && (
              <View style={styles.card}>
                <Text style={styles.pageTitle}>Track by ID</Text>
                <Text style={styles.cardSub}>Enter your reference code (e.g. GG-2026-RD01A).</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                  <TextInput
                    value={trackingInput}
                    onChangeText={setTrackingInput}
                    placeholder="GG-2026-XXXX"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="characters"
                    style={[styles.textInput, { flex: 1, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}
                  />
                  <Pressable
                    onPress={handleTrackingLookup}
                    disabled={lookupBusy || !trackingInput.trim()}
                    style={[styles.primaryButton, (lookupBusy || !trackingInput.trim()) && styles.disabledButton]}
                  >
                    <Text style={styles.primaryButtonText}>{lookupBusy ? "…" : "Track"}</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* OFFICER REPORTS QUEUE */}
            {role === "gro" && activeTab === "gro_reports" && (
              <>
                <View style={styles.pageHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.pageTitle}>
                      {auth?.user.name
                        ? `${getTimeOfDayGreeting()}, ${displayName(auth.user.name)}`
                        : "Reports"}
                    </Text>
                    <Text style={styles.pageSubtitle}>
                      {filteredComplaints.filter((c) => c.status === "submitted" || c.status === "under_review").length > 0
                        ? `${filteredComplaints.filter((c) => c.status === "submitted" || c.status === "under_review").length} report${
                            filteredComplaints.filter((c) => c.status === "submitted" || c.status === "under_review").length === 1 ? "" : "s"
                          } waiting for review`
                        : "No reports waiting for review right now."}
                    </Text>
                  </View>
                  <Pressable onPress={() => loadComplaints()} disabled={loadingList} style={styles.refreshIconBtn}>
                    <RefreshCw size={16} color={colors.textInk} />
                  </Pressable>
                </View>

                {/* Filter Pills */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {FILTER_OPTIONS.map((f) => (
                      <Pressable
                        key={f.id}
                        onPress={() => setQueueFilter(f.id)}
                        style={[styles.filterPill, queueFilter === f.id && styles.filterPillActive]}
                      >
                        <Text style={[styles.filterPillText, queueFilter === f.id && styles.filterPillTextActive]}>
                          {f.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>

                {/* Queue Search */}
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search by title, reference code, street…"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.textInput, { marginBottom: 12 }]}
                />

                {filteredComplaints.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <CheckCircle2 size={32} color={colors.textMuted} />
                    <Text style={styles.emptyTitle}>No reports found</Text>
                    <Text style={styles.emptySubtitle}>No reports match this status filter.</Text>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    {filteredComplaints.map((item) => (
                      <Pressable key={item.id} onPress={() => handleOpenDetail(item.tracking_id)} style={styles.cardItem}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={styles.itemCode}>{item.tracking_id}</Text>
                          <View style={styles.statusChip}>
                            <View
                              style={[
                                styles.statusDot,
                                { backgroundColor: STATUS_DOT_COLORS[item.status] || colors.textMuted },
                              ]}
                            />
                            <Text style={styles.statusLabelText}>{PLAIN_STATUS_LABELS[item.status] || item.status}</Text>
                          </View>
                        </View>
                        <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                        <View style={styles.itemFooter}>
                          <Text style={styles.itemMeta} numberOfLines={1}>{item.location_text}</Text>
                          <Text style={styles.itemMeta}>{formatRelativeTime(item.received_at)}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}

            {/* FIELD WORKER VIEW */}
            {role === "field_officer" && activeTab === "field_work" && (
              <View style={{ gap: 14 }}>
                <View style={styles.pageHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.pageTitle}>
                      {auth?.user.name
                        ? `${getTimeOfDayGreeting()}, ${displayName(auth.user.name)}`
                        : "Your work"}
                    </Text>
                    <Text style={styles.pageSubtitle}>
                      {fieldTasks.filter((t) => t.status !== "resolved" && t.status !== "rejected").length > 0
                        ? `${fieldTasks.filter((t) => t.status !== "resolved" && t.status !== "rejected").length} job${
                            fieldTasks.filter((t) => t.status !== "resolved" && t.status !== "rejected").length === 1 ? "" : "s"
                          } assigned to you today`
                        : "No open jobs assigned right now."}
                    </Text>
                  </View>
                </View>

                {loadingTasks ? (
                  <View style={[styles.emptyCard, { paddingVertical: 32 }]}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : fieldTasks.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <CheckCircle2 size={36} color={colors.textMuted} />
                    <Text style={styles.emptyTitle}>No work assigned to you right now</Text>
                    <Text style={styles.emptySubtitle}>
                      New assignments will appear here.
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    {fieldTasks.map((task) => (
                      <Pressable
                        key={task.assignment_id || task.complaint_id}
                        onPress={() => handleOpenDetail(task.tracking_id)}
                        style={styles.cardItem}
                      >
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={styles.itemCode}>{task.tracking_id}</Text>
                          <View style={styles.statusChip}>
                            <View
                              style={[
                                styles.statusDot,
                                { backgroundColor: STATUS_DOT_COLORS[task.status] || colors.textMuted },
                              ]}
                            />
                            <Text style={styles.statusLabelText}>{PLAIN_STATUS_LABELS[task.status] || task.status}</Text>
                          </View>
                        </View>
                        <Text style={styles.itemTitle} numberOfLines={2}>{task.title}</Text>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                          <Text style={[styles.itemMeta, { flex: 1, marginRight: 8 }]} numberOfLines={1}>
                            {task.area_name || task.location_text}
                          </Text>
                          <Pressable
                            onPress={() => {
                              if (task.latitude && task.longitude) {
                                Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${task.latitude},${task.longitude}`);
                              }
                            }}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 4,
                              backgroundColor: colors.bgSubtle,
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 4,
                            }}
                          >
                            <MapPin size={12} color={colors.primary} />
                            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary }}>Directions</Text>
                          </Pressable>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* SENIOR OVERVIEW */}
            {role === "supervisor" && activeTab === "senior_overview" && (
              <View style={{ gap: 14 }}>
                <View style={styles.pageHeader}>
                  <Text style={styles.pageTitle}>Senior authority</Text>
                </View>

                <View style={styles.emptyCard}>
                  <ShieldCheck size={36} color={colors.primary} />
                  <Text style={styles.emptyTitle}>Open GrievanceGrid on the web</Text>
                  <Text style={styles.emptySubtitle}>
                    The senior dashboard with charts, officers and reports is designed for desktop screens.
                  </Text>
                  <Pressable
                    onPress={handleSignOut}
                    style={[styles.secondaryButton, { marginTop: 16 }]}
                  >
                    <LogOut size={16} color={colors.error} />
                    <Text style={[styles.secondaryButtonText, { color: colors.error }]}>Sign out</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* ADMIN CONFIGURATION */}
            {role === "admin" && activeTab === "admin_config" && (
              <View style={{ gap: 14 }}>
                <View style={styles.pageHeader}>
                  <Text style={styles.pageTitle}>Admin</Text>
                </View>

                <View style={styles.emptyCard}>
                  <Settings size={36} color={colors.primary} />
                  <Text style={styles.emptyTitle}>Open GrievanceGrid on the web</Text>
                  <Text style={styles.emptySubtitle}>
                    The admin control centre for people and settings is designed for desktop screens.
                  </Text>
                  <Pressable
                    onPress={handleSignOut}
                    style={[styles.secondaryButton, { marginTop: 16 }]}
                  >
                    <LogOut size={16} color={colors.error} />
                    <Text style={[styles.secondaryButtonText, { color: colors.error }]}>Sign out</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* PROFILE VIEWS */}
            {(activeTab === "citizen_profile" ||
              activeTab === "gro_profile" ||
              activeTab === "field_profile" ||
              activeTab === "senior_profile" ||
              activeTab === "admin_profile") && (
              <View style={styles.card}>
                <View style={{ alignItems: "center", marginBottom: 20 }}>
                  <View style={styles.avatarCircle}>
                    <User size={32} color={colors.primary} />
                  </View>
                  <Text style={styles.profileName}>{auth.user.name}</Text>
                  <Text style={styles.profileEmail}>{auth.user.email}</Text>
                  <Text style={styles.profileRoleBadge}>{PLAIN_ROLE_LABELS[auth.user.role] || auth.user.role}</Text>
                </View>

                <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 16 }}>
                  <Pressable onPress={handleSignOut} style={[styles.secondaryButton, { marginTop: 10 }]}>
                    <LogOut size={16} color={colors.error} />
                    <Text style={[styles.secondaryButtonText, { color: colors.error }]}>Sign out</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Emergency Notice on Citizen and Sign In */}
            {isCitizenRole && (
              <View style={styles.emergencyFooter}>
                <Text style={styles.emergencyText}>
                  For emergencies, call your local emergency number.
                </Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* BOTTOM NAVIGATION BAR */}
        {auth && !selected && !isKeyboardVisible && (
          <View style={styles.bottomNav}>
            {role === "citizen" && (
              <>
                <Pressable
                  onPress={() => setActiveTab("citizen_track")}
                  style={[styles.navItem, activeTab === "citizen_track" && styles.navItemActive]}
                >
                  <Search size={20} color={activeTab === "citizen_track" ? colors.primary : colors.textMuted} />
                  <Text style={[styles.navLabel, activeTab === "citizen_track" && styles.navLabelActive]}>
                    Home
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setActiveTab("citizen_new")}
                  style={styles.navItem}
                >
                  <View style={styles.navItemRaised}>
                    <PlusCircle size={24} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.navLabel, activeTab === "citizen_new" && styles.navLabelActive]}>
                    Report
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setActiveTab("citizen_reports")}
                  style={[styles.navItem, activeTab === "citizen_reports" && styles.navItemActive]}
                >
                  <FileText size={20} color={activeTab === "citizen_reports" ? colors.primary : colors.textMuted} />
                  <Text style={[styles.navLabel, activeTab === "citizen_reports" && styles.navLabelActive]}>
                    My reports
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setActiveTab("citizen_profile")}
                  style={[styles.navItem, activeTab === "citizen_profile" && styles.navItemActive]}
                >
                  <User size={20} color={activeTab === "citizen_profile" ? colors.primary : colors.textMuted} />
                  <Text style={[styles.navLabel, activeTab === "citizen_profile" && styles.navLabelActive]}>
                    Profile
                  </Text>
                </Pressable>
              </>
            )}

            {role === "gro" && (
              <>
                <Pressable
                  onPress={() => setActiveTab("gro_reports")}
                  style={[styles.navItem, activeTab === "gro_reports" && styles.navItemActive]}
                >
                  <FileText size={20} color={activeTab === "gro_reports" ? colors.primary : colors.textMuted} />
                  <Text style={[styles.navLabel, activeTab === "gro_reports" && styles.navLabelActive]}>Reports</Text>
                </Pressable>
                <Pressable
                  onPress={() => setActiveTab("gro_track")}
                  style={[styles.navItem, activeTab === "gro_track" && styles.navItemActive]}
                >
                  <Search size={20} color={activeTab === "gro_track" ? colors.primary : colors.textMuted} />
                  <Text style={[styles.navLabel, activeTab === "gro_track" && styles.navLabelActive]}>Track</Text>
                </Pressable>
                <Pressable
                  onPress={() => setActiveTab("gro_profile")}
                  style={[styles.navItem, activeTab === "gro_profile" && styles.navItemActive]}
                >
                  <User size={20} color={activeTab === "gro_profile" ? colors.primary : colors.textMuted} />
                  <Text style={[styles.navLabel, activeTab === "gro_profile" && styles.navLabelActive]}>Profile</Text>
                </Pressable>
              </>
            )}

            {role === "field_officer" && (
              <>
                <Pressable
                  onPress={() => setActiveTab("field_work")}
                  style={[styles.navItem, activeTab === "field_work" && styles.navItemActive]}
                >
                  <ShieldCheck size={20} color={activeTab === "field_work" ? colors.primary : colors.textMuted} />
                  <Text style={[styles.navLabel, activeTab === "field_work" && styles.navLabelActive]}>Work</Text>
                </Pressable>
                <Pressable
                  onPress={() => setActiveTab("field_profile")}
                  style={[styles.navItem, activeTab === "field_profile" && styles.navItemActive]}
                >
                  <User size={20} color={activeTab === "field_profile" ? colors.primary : colors.textMuted} />
                  <Text style={[styles.navLabel, activeTab === "field_profile" && styles.navLabelActive]}>Profile</Text>
                </Pressable>
              </>
            )}

            {role === "supervisor" && (
              <>
                <Pressable
                  onPress={() => setActiveTab("senior_overview")}
                  style={[styles.navItem, activeTab === "senior_overview" && styles.navItemActive]}
                >
                  <ShieldCheck size={20} color={activeTab === "senior_overview" ? colors.primary : colors.textMuted} />
                  <Text style={[styles.navLabel, activeTab === "senior_overview" && styles.navLabelActive]}>Overview</Text>
                </Pressable>
                <Pressable
                  onPress={() => setActiveTab("senior_profile")}
                  style={[styles.navItem, activeTab === "senior_profile" && styles.navItemActive]}
                >
                  <User size={20} color={activeTab === "senior_profile" ? colors.primary : colors.textMuted} />
                  <Text style={[styles.navLabel, activeTab === "senior_profile" && styles.navLabelActive]}>Profile</Text>
                </Pressable>
              </>
            )}

            {role === "admin" && (
              <>
                <Pressable
                  onPress={() => setActiveTab("admin_config")}
                  style={[styles.navItem, activeTab === "admin_config" && styles.navItemActive]}
                >
                  <Settings size={20} color={activeTab === "admin_config" ? colors.primary : colors.textMuted} />
                  <Text style={[styles.navLabel, activeTab === "admin_config" && styles.navLabelActive]}>Config</Text>
                </Pressable>
                <Pressable
                  onPress={() => setActiveTab("admin_profile")}
                  style={[styles.navItem, activeTab === "admin_profile" && styles.navItemActive]}
                >
                  <User size={20} color={activeTab === "admin_profile" ? colors.primary : colors.textMuted} />
                  <Text style={[styles.navLabel, activeTab === "admin_profile" && styles.navLabelActive]}>Profile</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  header: {
    height: 56,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  headerBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandIcon: {
    width: 20,
    height: 20,
    justifyContent: "space-between",
  },
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  brandSquare: {
    width: 8,
    height: 8,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  brandBold: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textInk,
  },
  brandRegular: {
    fontSize: 18,
    fontWeight: "400",
    color: colors.textInk,
  },
  headerUser: {
    flexDirection: "row",
    alignItems: "center",
  },
  userRoleTag: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.textMuted,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 40,
  },
  errorBanner: {
    backgroundColor: colors.errorBg,
    borderColor: "rgba(180, 35, 24, 0.2)",
    borderWidth: 1,
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorBannerText: {
    color: colors.error,
    fontSize: 13,
    flex: 1,
  },
  successBanner: {
    backgroundColor: colors.successBg,
    borderColor: "rgba(30, 122, 76, 0.2)",
    borderWidth: 1,
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  successBannerText: {
    color: colors.success,
    fontSize: 13,
    flex: 1,
  },
  card: {
    backgroundColor: colors.bgSurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardItem: {
    backgroundColor: colors.bgSurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  backButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "500",
  },
  detailHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  trackingCode: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 14,
    color: colors.primary,
    fontWeight: "600",
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusLabelText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textInk,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textInk,
    lineHeight: 24,
    marginVertical: 4,
  },
  detailDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textInk,
    marginVertical: 6,
  },
  detailMetaRow: {
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: 12,
    marginTop: 8,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  priorityBox: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 6,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textInk,
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textInk,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.textInk,
    minHeight: 44,
  },
  choiceGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  choiceBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSurface,
  },
  choiceBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  choiceBtnText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  choiceBtnTextActive: {
    color: colors.primaryText,
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    flexDirection: "row",
    gap: 8,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: colors.bgSurface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 6,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    flexDirection: "row",
    gap: 8,
  },
  secondaryButtonText: {
    color: colors.textInk,
    fontSize: 14,
    fontWeight: "500",
  },
  disabledButton: {
    opacity: 0.5,
  },
  timelineItem: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  timelineStatus: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textInk,
  },
  timelineDate: {
    fontSize: 11,
    color: colors.textMuted,
  },
  timelineNote: {
    fontSize: 13,
    color: colors.textInk,
    lineHeight: 18,
    marginTop: 2,
  },
  mutedNotice: {
    fontSize: 13,
    color: colors.textMuted,
  },
  evidenceItem: {
    padding: 10,
    backgroundColor: colors.bgSubtle,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  evidenceText: {
    fontSize: 13,
    color: colors.textInk,
  },
  authPhotoBand: {
    width: "100%",
    maxWidth: 400,
    height: 180,
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 10,
    marginBottom: 4,
    position: "relative",
    alignSelf: "center",
    backgroundColor: "#0b1120",
  },
  authPhotoImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  authPhotoOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.38)",
  },
  authPhotoTextWrap: {
    position: "absolute",
    bottom: 14,
    left: 16,
    right: 16,
  },
  authPhotoHeadline: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 3,
  },
  authPhotoSupport: {
    color: "rgba(255, 255, 255, 0.92)",
    fontSize: 12,
    lineHeight: 16,
  },
  categoryNotice: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  authCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    marginTop: 20,
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
  },
  authTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.textInk,
    marginBottom: 6,
  },
  authSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 20,
  },
  testAccountBox: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
    marginTop: 8,
    width: "100%",
  },
  testAccountRow: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  toggleAuthBtn: {
    marginTop: 18,
    alignItems: "center",
  },
  toggleAuthText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "500",
  },
  emergencyFooter: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  emergencyText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.textInk,
  },
  pageSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  cardSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  refreshIconBtn: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 32,
    alignItems: "center",
    textAlign: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textInk,
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
  itemCode: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
    color: colors.primary,
    fontWeight: "600",
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.textInk,
    lineHeight: 20,
  },
  itemFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  itemMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  stepperHeader: {
    marginBottom: 16,
  },
  stepperStep: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
  stepperTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textInk,
    marginTop: 2,
  },
  categoryOption: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSurface,
  },
  categoryOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textInk,
  },
  categoryTitleActive: {
    color: colors.primaryText,
  },
  categoryDesc: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  tagBadge: {
    backgroundColor: colors.bgSubtle,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textMuted,
  },
  stepperActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 16,
  },
  safetyBox: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  reviewBox: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    padding: 14,
    gap: 4,
  },
  reviewLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
  },
  reviewValue: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textInk,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSurface,
  },
  filterPillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  filterPillText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  filterPillTextActive: {
    color: colors.primaryText,
    fontWeight: "600",
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryTint,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textInk,
  },
  profileEmail: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  profileRoleBadge: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.primary,
    marginTop: 4,
    backgroundColor: colors.primaryTint,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bottomNav: {
    height: 60,
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  navItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    flex: 1,
  },
  navItemRaised: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: -8,
    backgroundColor: colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  navItemActive: {},
  navLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  navLabelActive: {
    color: colors.primary,
    fontWeight: "600",
  },
});
