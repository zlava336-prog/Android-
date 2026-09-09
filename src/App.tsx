/**
 * Phone Agent - Material 3 Companion Web Dashboard & Emulator
 * Production-oriented personal Android companion agent for authorized social publishing.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MaterialTopBar } from './components/MaterialTopBar';
import { MaterialNavBar, NavScreen } from './components/MaterialNavBar';
import { HomeScreen } from './components/screens/HomeScreen';
import { ProductResearchScreen } from './components/screens/ProductResearchScreen';
import { ContentReviewScreen } from './components/screens/ContentReviewScreen';
import { MultiPlatformJobScreen } from './components/screens/MultiPlatformJobScreen';
import { CurrentJobScreen } from './components/screens/CurrentJobScreen';
import { AppConnectionsScreen } from './components/screens/AppConnectionsScreen';
import { AutomationSettingsScreen } from './components/screens/AutomationSettingsScreen';
import { LogsScreen } from './components/screens/LogsScreen';
import { PermissionsScreen } from './components/screens/PermissionsScreen';
import { EmergencyStopScreen } from './components/screens/EmergencyStopScreen';
import { AboutScreen } from './components/screens/AboutScreen';
import { TestsScreen } from './components/screens/TestsScreen';
import { PublishApprovalModal } from './components/modals/PublishApprovalModal';
import { SecurityAlertModal } from './components/modals/SecurityAlertModal';

import { JobModel, JobState, ActionLog, BackendConfig, UiNode, SupportedPlatform } from './types/job';
import { JobStateMachine } from './core/stateMachine';
import { EmergencyStopManager } from './core/emergencyStop';
import { LocalActionLogger } from './core/logger';
import { SafeUiInspector, SafeActionExecutor } from './core/inspector';
import { InstagramAdapter } from './core/adapters/InstagramAdapter';
import { AmazonAdapter } from './core/adapters/AmazonAdapter';
import { YouTubeAdapter } from './core/adapters/YouTubeAdapter';
import { FacebookAdapter } from './core/adapters/FacebookAdapter';
import { TikTokAdapter } from './core/adapters/TikTokAdapter';
import { PinterestAdapter } from './core/adapters/PinterestAdapter';
import { XAdapter } from './core/adapters/XAdapter';
import { ThreadsAdapter } from './core/adapters/ThreadsAdapter';
import { LinkedInAdapter } from './core/adapters/LinkedInAdapter';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [currentScreen, setCurrentScreen] = useState<NavScreen>('home');
  const [backendConnected, setBackendConnected] = useState(true);

  // Core Instances
  const stateMachine = useMemo(() => new JobStateMachine('RECEIVED'), []);
  const emergencyStopManager = useMemo(() => EmergencyStopManager.getInstance(), []);
  const logger = useMemo(() => LocalActionLogger.getInstance(), []);
  const inspector = useMemo(() => new SafeUiInspector('com.instagram.android'), []);
  const executor = useMemo(() => new SafeActionExecutor(), []);

  const [instagramAdapter] = useState(() => new InstagramAdapter(inspector, executor));
  const [amazonAdapter] = useState(() => new AmazonAdapter(inspector, executor));
  const [youtubeAdapter] = useState(() => new YouTubeAdapter(inspector, executor));
  const [facebookAdapter] = useState(() => new FacebookAdapter(inspector, executor));
  const [tiktokAdapter] = useState(() => new TikTokAdapter(inspector, executor));
  const [pinterestAdapter] = useState(() => new PinterestAdapter(inspector, executor));
  const [xAdapter] = useState(() => new XAdapter(inspector, executor));
  const [threadsAdapter] = useState(() => new ThreadsAdapter(inspector, executor));
  const [linkedinAdapter] = useState(() => new LinkedInAdapter(inspector, executor));

  // Reactive State
  const [jobState, setJobState] = useState<JobState>('RECEIVED');
  const [isEmergencyActive, setIsEmergencyActive] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState('');
  const [logs, setLogs] = useState<ActionLog[]>(() => logger.getLogs());
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [isSecurityAlertOpen, setIsSecurityAlertOpen] = useState(false);
  const [securityAlertDetails, setSecurityAlertDetails] = useState({ reason: '', element: '' });
  const [isPaused, setIsPaused] = useState(false);
  const [isAutoRunning, setIsAutoRunning] = useState(false);

  // Active Job Payload
  const [currentJob, setCurrentJob] = useState<JobModel | null>({
    jobId: 'reel_001',
    platform: 'instagram',
    action: 'publish_reel',
    videoUri: 'content://media/external/video/media/1042',
    caption: 'Top minimal workspace gadgets for software engineers',
    hashtags: ['#amazonfinds', '#deals', '#techdesk'],
    coverUri: 'content://media/external/images/media/89',
    requiresApproval: true,
  });

  // Backend Config
  const [backendConfig, setBackendConfig] = useState<BackendConfig>({
    apiBaseUrl: 'https://api.mycompanion.ai/v1',
    websocketUrl: 'wss://ws.mycompanion.ai/agent',
    deviceId: 'phone_s24u_01',
    authToken: 'sk_live_enc_9a87bf4c832',
    connected: true,
    heartbeatIntervalSec: 15,
  });

  // Simulated live UI nodes in current foreground window
  const [simulatedNodes, setSimulatedNodes] = useState<UiNode[]>([
    {
      id: 'com.instagram.android:id/gallery_recycler_view',
      className: 'androidx.recyclerview.widget.RecyclerView',
      isClickable: true,
      isEditable: false,
      isVisible: true,
      packageName: 'com.instagram.android',
      bounds: { x: 0, y: 300, width: 1080, height: 1600 },
    },
    {
      id: 'com.instagram.android:id/caption_text_view',
      text: 'Top minimal workspace gadgets...',
      contentDescription: 'Write a caption',
      className: 'android.widget.EditText',
      isClickable: true,
      isEditable: true,
      isVisible: true,
      packageName: 'com.instagram.android',
      bounds: { x: 50, y: 250, width: 980, height: 200 },
    },
    {
      id: 'com.instagram.android:id/share_footer_button',
      text: 'Share',
      contentDescription: 'Share to Instagram Reels',
      className: 'android.widget.Button',
      isClickable: true,
      isEditable: false,
      isVisible: true,
      packageName: 'com.instagram.android',
      bounds: { x: 100, y: 1900, width: 880, height: 120 },
    },
  ]);

  // Subscribe to state machine changes
  useEffect(() => {
    const unsubSm = stateMachine.addListener((newState, oldState) => {
      setJobState(newState);
      logger.log({
        jobId: currentJob?.jobId,
        platform: currentJob?.platform,
        action: `STATE_TRANSITION`,
        details: `Transitioned: ${oldState} -> ${newState}`,
        severity: newState === 'STOPPED' ? 'WARN' : 'INFO',
      });

      if (newState === 'WAITING_FOR_APPROVAL' && currentJob?.requiresApproval) {
        setIsApprovalModalOpen(true);
      }
    });

    const unsubEs = emergencyStopManager.addListener((reason, _time) => {
      setIsEmergencyActive(true);
      setEmergencyReason(reason);
      stateMachine.triggerEmergencyStop(reason);
      executor.setHalted(true);
      instagramAdapter.stop();
      amazonAdapter.stop();
      youtubeAdapter.stop();
      facebookAdapter.stop();
      tiktokAdapter.stop();
      pinterestAdapter.stop();
      xAdapter.stop();
      setIsAutoRunning(false);
      logger.log({
        action: 'EMERGENCY_STOP_TRIGGERED',
        details: reason,
        severity: 'SECURITY',
        safetyCheckPassed: false,
      });
    });

    const unsubLogs = logger.addListener(() => {
      setLogs(logger.getLogs());
    });

    return () => {
      unsubSm();
      unsubEs();
      unsubLogs();
    };
  }, [stateMachine, emergencyStopManager, logger, executor, instagramAdapter, amazonAdapter, youtubeAdapter, facebookAdapter, tiktokAdapter, pinterestAdapter, xAdapter, currentJob]);

  // Advance state machine one step safely
  const advanceState = async () => {
    if (emergencyStopManager.isActive()) return;
    const current = stateMachine.getState();

    // Safety checks before advancing
    const security = await inspector.checkSecurityTripwires();
    if (security.tripped) {
      handleTripwireTriggered(security.reason || 'Safety Tripwire Tripped', security.detectedElement);
      return;
    }

    switch (current) {
      case 'RECEIVED':
        stateMachine.transitionTo('VALIDATING');
        break;
      case 'VALIDATING':
        stateMachine.transitionTo('OPENING_APP');
        break;
      case 'OPENING_APP':
        stateMachine.transitionTo('WAITING_FOR_READY');
        break;
      case 'WAITING_FOR_READY':
        stateMachine.transitionTo('SELECTING_MEDIA');
        break;
      case 'SELECTING_MEDIA':
        stateMachine.transitionTo('ENTERING_METADATA');
        break;
      case 'ENTERING_METADATA':
        stateMachine.transitionTo('VERIFYING_PREVIEW');
        break;
      case 'VERIFYING_PREVIEW':
        if (currentJob?.requiresApproval) {
          stateMachine.transitionTo('WAITING_FOR_APPROVAL');
        } else {
          stateMachine.transitionTo('PUBLISHING');
        }
        break;
      case 'WAITING_FOR_APPROVAL':
        // Gated by modal
        setIsApprovalModalOpen(true);
        break;
      case 'PUBLISHING': {
        let res;
        if (currentJob?.platform === 'amazon') {
          res = await amazonAdapter.publish();
          if (res.data?.productUrl && currentJob) {
            setCurrentJob({ ...currentJob, extractedUrl: String(res.data.productUrl) });
          }
        } else if (currentJob?.platform === 'youtube') {
          res = await youtubeAdapter.publish();
        } else if (currentJob?.platform === 'facebook') {
          res = await facebookAdapter.publish();
        } else if (currentJob?.platform === 'tiktok') {
          res = await tiktokAdapter.publish();
        } else if (currentJob?.platform === 'pinterest') {
          res = await pinterestAdapter.publish();
        } else if (currentJob?.platform === 'x') {
          res = await xAdapter.publish();
        } else if (currentJob?.platform === 'threads') {
          res = await threadsAdapter.publish();
        } else if (currentJob?.platform === 'linkedin') {
          res = await linkedinAdapter.publish();
        } else {
          res = await instagramAdapter.publish();
        }
        if (res.success) {
          stateMachine.transitionTo('VERIFYING_RESULT');
        } else {
          stateMachine.transitionTo('FAILED', res.message);
        }
        break;
      }
      case 'VERIFYING_RESULT':
        stateMachine.transitionTo('COMPLETED');
        setIsAutoRunning(false);
        break;
      default:
        break;
    }
  };

  // Auto-run full pipeline loop with safety delay
  const autoRunTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startAutoRun = () => {
    setIsAutoRunning(true);
    setIsPaused(false);
  };

  useEffect(() => {
    if (isAutoRunning && !isPaused && !isEmergencyActive) {
      if (jobState === 'WAITING_FOR_APPROVAL' || jobState === 'COMPLETED' || jobState === 'STOPPED' || jobState === 'FAILED') {
        setIsAutoRunning(false);
        return;
      }
      autoRunTimerRef.current = setTimeout(() => {
        advanceState();
      }, 900);
    }
    return () => {
      if (autoRunTimerRef.current) clearTimeout(autoRunTimerRef.current);
    };
  }, [isAutoRunning, isPaused, isEmergencyActive, jobState]);

  const handleTripwireTriggered = (reason: string, element?: string) => {
    emergencyStopManager.trigger(reason);
    setSecurityAlertDetails({ reason, element: element || 'UI Inspector Scan' });
    setIsSecurityAlertOpen(true);
  };

  // Simulate safety tripwires for interactive testing
  const simulateTripwire = (type: 'captcha' | 'otp' | 'banking') => {
    if (type === 'captcha') {
      inspector.simulateSecurityTripwire('CAPTCHA puzzle challenge detected on screen. Automation halted.');
      handleTripwireTriggered(
        'CAPTCHA challenge detected: "Please verify you are a human". Phone Agent is strictly forbidden from bypassing CAPTCHA.',
        'com.instagram.android:id/captcha_challenge_webview'
      );
    } else if (type === 'otp') {
      inspector.simulateSecurityTripwire('OTP / Two-Factor Authentication prompt detected. Automation halted.');
      handleTripwireTriggered(
        'Security challenge detected: "Enter OTP sent via SMS". Phone Agent never accesses SMS, OTPs, or 2FA credentials.',
        'com.instagram.android:id/two_factor_code_input'
      );
    } else if (type === 'banking') {
      inspector.setPackage('com.google.android.apps.nbu.paisa.user');
      handleTripwireTriggered(
        'Prohibited financial app detected: Google Pay (com.google.android.apps.nbu.paisa.user). Immediate emergency abort.',
        'com.google.android.apps.nbu.paisa.user'
      );
    }
  };

  const handleEmergencyStop = () => {
    emergencyStopManager.trigger('Operator pressed global Emergency STOP button.');
  };

  const handleResetEmergencyStop = () => {
    emergencyStopManager.reset();
    inspector.clearSecurityTripwire();
    inspector.setPackage(
      currentJob?.platform === 'amazon'
        ? 'com.amazon.mShop.android.shopping'
        : currentJob?.platform === 'youtube'
        ? 'com.google.android.youtube'
        : currentJob?.platform === 'facebook'
        ? 'com.facebook.katana'
        : currentJob?.platform === 'tiktok'
        ? 'com.zhiliaoapp.musically'
        : currentJob?.platform === 'pinterest'
        ? 'com.pinterest'
        : currentJob?.platform === 'x'
        ? 'com.twitter.android'
        : currentJob?.platform === 'threads'
        ? 'com.instagram.barcelona'
        : currentJob?.platform === 'linkedin'
        ? 'com.linkedin.android'
        : 'com.instagram.android'
    );
    stateMachine.reset();
    executor.setHalted(false);
    setIsEmergencyActive(false);
    setEmergencyReason('');
    setIsAutoRunning(false);
    logger.log({
      action: 'SAFETY_LOCK_RELEASED',
      details: 'Emergency stop released. System returned to STANDBY.',
      severity: 'INFO',
    });
  };

  const handleLoadSampleJob = (type: SupportedPlatform | 'instagram' | 'amazon' | 'youtube' | 'facebook' | 'tiktok' | 'pinterest' | 'x' | 'threads' | 'linkedin') => {
    stateMachine.reset();
    setIsEmergencyActive(false);
    inspector.clearSecurityTripwire();
    executor.setHalted(false);

    if (type === 'linkedin') {
      inspector.setPackage('com.linkedin.android');
      const newJob: JobModel = {
        jobId: `li_${Math.floor(Math.random() * 900 + 100)}`,
        platform: 'linkedin',
        action: 'publish_post',
        caption: 'Excited to share our latest architecture milestone for Phone Agent: zero-trust UI accessibility automation on Android 🚀📱',
        hashtags: ['#AndroidDev', '#SafetyFirst', '#Automation', '#TechInnovation'],
        videoUri: 'content://media/external/video/media/9921',
        requiresApproval: true,
      };
      setCurrentJob(newJob);
      setSimulatedNodes([
        {
          id: 'com.linkedin.android:id/share_box',
          text: 'Start a post',
          contentDescription: 'Start a post',
          className: 'android.widget.TextView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 40, y: 180, width: 1000, height: 120 },
        },
        {
          id: 'com.linkedin.android:id/composer_edit_text',
          text: `${newJob.caption}\n\n#AndroidDev #SafetyFirst #Automation #TechInnovation`,
          contentDescription: 'What do you want to talk about?',
          className: 'android.widget.EditText',
          isClickable: true,
          isEditable: true,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 40, y: 300, width: 1000, height: 380 },
        },
        {
          id: 'com.linkedin.android:id/media_preview',
          text: 'Media preview',
          contentDescription: 'Attached video preview',
          className: 'android.view.View',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 40, y: 700, width: 1000, height: 400 },
        },
        {
          id: 'com.linkedin.android:id/post_button',
          text: 'Post',
          contentDescription: 'Post',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 840, y: 100, width: 200, height: 90 },
        },
        {
          id: 'com.linkedin.android:id/toast',
          text: 'Your post was shared',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.linkedin.android',
          bounds: { x: 40, y: 2100, width: 960, height: 100 },
        },
      ]);
    } else if (type === 'threads') {
      inspector.setPackage('com.instagram.barcelona');
      const newJob: JobModel = {
        jobId: `th_${Math.floor(Math.random() * 900 + 100)}`,
        platform: 'threads',
        action: 'publish_thread',
        caption: 'Exploring Phone Agent zero-trust accessibility automation for Threads 🧵⚡️',
        hashtags: ['#AndroidDev', '#PhoneAgent', '#Kotlin'],
        videoUri: 'content://media/external/video/media/7711',
        requiresApproval: true,
      };
      setCurrentJob(newJob);
      setSimulatedNodes([
        {
          id: 'com.instagram.barcelona:id/creation_tab',
          text: 'New thread',
          contentDescription: 'New thread',
          className: 'android.widget.FrameLayout',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.instagram.barcelona',
          bounds: { x: 450, y: 2000, width: 180, height: 180 },
        },
        {
          id: 'com.instagram.barcelona:id/post_text_view',
          text: `${newJob.caption}\n\n#AndroidDev #PhoneAgent #Kotlin`,
          contentDescription: 'Start a thread...',
          className: 'android.widget.EditText',
          isClickable: true,
          isEditable: true,
          isVisible: true,
          packageName: 'com.instagram.barcelona',
          bounds: { x: 40, y: 300, width: 1000, height: 350 },
        },
        {
          id: 'com.instagram.barcelona:id/button_post',
          text: 'Post',
          contentDescription: 'Post',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.instagram.barcelona',
          bounds: { x: 800, y: 100, width: 200, height: 100 },
        },
        {
          id: 'com.instagram.barcelona:id/toast',
          text: 'Your thread was posted',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.instagram.barcelona',
          bounds: { x: 40, y: 2100, width: 960, height: 100 },
        },
      ]);
    } else if (type === 'x') {
      inspector.setPackage('com.twitter.android');
      const newJob: JobModel = {
        jobId: `x_${Math.floor(Math.random() * 900 + 100)}`,
        platform: 'x',
        action: 'publish_post',
        caption: 'Introducing Phone Agent: zero-trust UI automation companion for Android 🤖',
        hashtags: ['#Android', '#Automation', '#OpenSource'],
        videoUri: 'content://media/external/video/media/8088',
        requiresApproval: true,
      };
      setCurrentJob(newJob);
      setSimulatedNodes([
        {
          id: 'com.twitter.android:id/composer_write',
          text: 'Post',
          contentDescription: 'New post',
          className: 'android.widget.ImageButton',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.twitter.android',
          bounds: { x: 880, y: 1950, width: 140, height: 140 },
        },
        {
          id: 'com.twitter.android:id/tweet_text',
          text: `${newJob.caption} #Android #Automation #OpenSource`,
          contentDescription: "What's happening?",
          className: 'android.widget.EditText',
          isClickable: true,
          isEditable: true,
          isVisible: true,
          packageName: 'com.twitter.android',
          bounds: { x: 40, y: 300, width: 1000, height: 260 },
        },
        {
          id: 'com.twitter.android:id/button_tweet',
          text: 'Post',
          contentDescription: 'Post tweet',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.twitter.android',
          bounds: { x: 840, y: 120, width: 200, height: 90 },
        },
        {
          id: 'com.twitter.android:id/toast',
          text: 'Your post was sent',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.twitter.android',
          bounds: { x: 40, y: 2150, width: 600, height: 80 },
        },
      ]);
    } else if (type === 'pinterest') {
      inspector.setPackage('com.pinterest');
      const newJob: JobModel = {
        jobId: `pin_${Math.floor(Math.random() * 900 + 100)}`,
        platform: 'pinterest',
        action: 'publish_pin',
        imageUri: 'content://media/external/images/media/4421',
        title: 'Modern Organic Living Room Aesthetic',
        description: 'Warm neutral tones, natural wood textures, and minimalist lighting inspiration for 2026.\nPerfect for cozy apartment spaces.',
        board: 'Interior Inspiration',
        hashtags: ['#homedecor', '#aesthetic', '#minimalism', '#interiordesign'],
        requiresApproval: true,
      };
      setCurrentJob(newJob);
      setSimulatedNodes([
        {
          id: 'com.pinterest:id/bottom_nav_create_button',
          text: 'Create',
          contentDescription: 'Create',
          className: 'android.widget.FrameLayout',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 480, y: 2200, width: 120, height: 120 },
        },
        {
          id: 'com.pinterest:id/pin_title_edit_text',
          text: newJob.title || '',
          contentDescription: 'Add a title',
          className: 'android.widget.EditText',
          isClickable: true,
          isEditable: true,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 40, y: 200, width: 1000, height: 120 },
        },
        {
          id: 'com.pinterest:id/pin_description_edit_text',
          text: `${newJob.description} #homedecor #aesthetic #minimalism #interiordesign`,
          contentDescription: 'Tell everyone what your Pin is about',
          className: 'android.widget.EditText',
          isClickable: true,
          isEditable: true,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 40, y: 340, width: 1000, height: 350 },
        },
        {
          id: 'com.pinterest:id/board_list_item',
          text: 'Interior Inspiration',
          contentDescription: 'Interior Inspiration',
          className: 'android.widget.TextView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 40, y: 720, width: 1000, height: 100 },
        },
        {
          id: 'com.pinterest:id/save_pinnable_button',
          text: 'Save',
          contentDescription: 'Save',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 840, y: 150, width: 180, height: 100 },
        },
        {
          id: 'com.pinterest:id/toast_message',
          text: 'Saved to Interior Inspiration!',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.pinterest',
          bounds: { x: 40, y: 2150, width: 600, height: 80 },
        },
      ]);
    } else if (type === 'tiktok') {
      inspector.setPackage('com.zhiliaoapp.musically');
      const newJob: JobModel = {
        jobId: `tt_${Math.floor(Math.random() * 900 + 100)}`,
        platform: 'tiktok',
        action: 'publish_video',
        videoUri: 'content://media/external/video/media/9021',
        caption: '5 daily developer essentials for productive flow',
        hashtags: ['#coding', '#developer', '#techsetup', '#fyp'],
        requiresApproval: true,
      };
      setCurrentJob(newJob);
      setSimulatedNodes([
        {
          id: 'com.zhiliaoapp.musically:id/tab_publish',
          text: '+',
          contentDescription: 'Create',
          className: 'android.widget.ImageView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.zhiliaoapp.musically',
          bounds: { x: 480, y: 2200, width: 120, height: 120 },
        },
        {
          id: 'com.zhiliaoapp.musically:id/upload_button',
          text: 'Upload',
          contentDescription: 'Upload',
          className: 'android.widget.TextView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.zhiliaoapp.musically',
          bounds: { x: 800, y: 2050, width: 180, height: 120 },
        },
        {
          id: 'com.zhiliaoapp.musically:id/desc_edit_text',
          text: `${newJob.caption} #coding #developer #techsetup #fyp`,
          contentDescription: 'Describe your video',
          className: 'android.widget.EditText',
          isClickable: true,
          isEditable: true,
          isVisible: true,
          packageName: 'com.zhiliaoapp.musically',
          bounds: { x: 40, y: 200, width: 1000, height: 350 },
        },
        {
          id: 'com.zhiliaoapp.musically:id/btn_post',
          text: 'Post',
          contentDescription: 'Post',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.zhiliaoapp.musically',
          bounds: { x: 720, y: 2120, width: 320, height: 120 },
        },
        {
          id: 'com.zhiliaoapp.musically:id/tv_toast',
          text: 'Your video was uploaded',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.zhiliaoapp.musically',
          bounds: { x: 40, y: 2150, width: 600, height: 80 },
        },
      ]);
    } else if (type === 'youtube') {
      inspector.setPackage('com.google.android.youtube');
      const newJob: JobModel = {
        jobId: `short_${Math.floor(Math.random() * 900 + 100)}`,
        platform: 'youtube',
        action: 'publish_short',
        videoUri: 'content://media/external/video/media/5021',
        caption: 'Top 3 Productive Workspace Tools in 2026',
        hashtags: ['#Shorts', '#tech', '#desksetup'],
        requiresApproval: true,
      };
      setCurrentJob(newJob);
      setSimulatedNodes([
        {
          id: 'com.google.android.youtube:id/menu_create',
          text: 'Create',
          contentDescription: 'Create',
          className: 'android.widget.ImageView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.google.android.youtube',
          bounds: { x: 480, y: 2200, width: 120, height: 120 },
        },
        {
          id: 'com.google.android.youtube:id/title_edit_text',
          text: `${newJob.caption} #Shorts #tech #desksetup`,
          contentDescription: 'Create a title',
          className: 'android.widget.EditText',
          isClickable: true,
          isEditable: true,
          isVisible: true,
          packageName: 'com.google.android.youtube',
          bounds: { x: 60, y: 400, width: 960, height: 200 },
        },
        {
          id: 'com.google.android.youtube:id/upload_bottom_button',
          text: 'Upload Short',
          contentDescription: 'Upload Short',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.google.android.youtube',
          bounds: { x: 60, y: 2050, width: 960, height: 150 },
        },
        {
          id: 'com.google.android.youtube:id/upload_progress',
          text: 'Uploading to your videos',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.google.android.youtube',
          bounds: { x: 40, y: 2150, width: 600, height: 80 },
        },
      ]);
    } else if (type === 'facebook') {
      inspector.setPackage('com.facebook.katana');
      const newJob: JobModel = {
        jobId: `fb_${Math.floor(Math.random() * 900 + 100)}`,
        platform: 'facebook',
        action: 'publish_post',
        videoUri: 'content://media/external/video/media/7021',
        caption: 'Design update: Exploring next-generation companion workflows for creators.',
        hashtags: ['#design', '#engineering', '#productivity'],
        requiresApproval: true,
      };
      setCurrentJob(newJob);
      setSimulatedNodes([
        {
          id: 'com.facebook.katana:id/composer_photo_video_button',
          text: 'Photo/video',
          contentDescription: 'Photo/video',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.facebook.katana',
          bounds: { x: 60, y: 1800, width: 440, height: 120 },
        },
        {
          id: 'com.facebook.katana:id/composer_edit_text',
          text: `${newJob.caption} #design #engineering #productivity`,
          contentDescription: "What's on your mind?",
          className: 'android.widget.EditText',
          isClickable: true,
          isEditable: true,
          isVisible: true,
          packageName: 'com.facebook.katana',
          bounds: { x: 60, y: 400, width: 960, height: 300 },
        },
        {
          id: 'com.facebook.katana:id/feed_composer_post_button',
          text: 'Post',
          contentDescription: 'Post',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.facebook.katana',
          bounds: { x: 840, y: 100, width: 200, height: 100 },
        },
        {
          id: 'com.facebook.katana:id/snackbar_text',
          text: 'Your post was shared to your feed',
          className: 'android.widget.TextView',
          isClickable: false,
          isEditable: false,
          isVisible: true,
          packageName: 'com.facebook.katana',
          bounds: { x: 40, y: 2150, width: 600, height: 80 },
        },
      ]);
    } else if (type === 'instagram') {
      inspector.setPackage('com.instagram.android');
      const newJob: JobModel = {
        jobId: `reel_${Math.floor(Math.random() * 900 + 100)}`,
        platform: 'instagram',
        action: 'publish_reel',
        videoUri: 'content://media/external/video/media/1042',
        caption: 'Unboxing the ultra-clean ergonomic mechanical keyboard',
        hashtags: ['#amazonfinds', '#desksetup', '#keebs'],
        coverUri: 'content://media/external/images/media/89',
        requiresApproval: true,
      };
      setCurrentJob(newJob);
      setSimulatedNodes([
        {
          id: 'com.instagram.android:id/caption_text_view',
          text: newJob.caption,
          className: 'android.widget.EditText',
          isClickable: true,
          isEditable: true,
          isVisible: true,
          packageName: 'com.instagram.android',
          bounds: { x: 50, y: 300, width: 980, height: 200 },
        },
        {
          id: 'com.instagram.android:id/share_footer_button',
          text: 'Share',
          className: 'android.widget.Button',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.instagram.android',
          bounds: { x: 100, y: 1900, width: 880, height: 120 },
        },
      ]);
    } else {
      inspector.setPackage('com.amazon.mShop.android.shopping');
      const newJob: JobModel = {
        jobId: `amz_${Math.floor(Math.random() * 900 + 100)}`,
        platform: 'amazon',
        action: 'extract_product_link',
        productSearchQuery: 'Sony WH-1000XM5 Noise Canceling Headphones',
        requiresApproval: true,
      };
      setCurrentJob(newJob);
      setSimulatedNodes([
        {
          id: 'com.amazon.mShop.android.shopping:id/rs_search_src_text',
          text: newJob.productSearchQuery,
          className: 'android.widget.EditText',
          isClickable: true,
          isEditable: true,
          isVisible: true,
          packageName: 'com.amazon.mShop.android.shopping',
          bounds: { x: 80, y: 150, width: 800, height: 90 },
        },
        {
          id: 'com.amazon.mShop.android.shopping:id/share_button',
          contentDescription: 'Share',
          className: 'android.widget.ImageView',
          isClickable: true,
          isEditable: false,
          isVisible: true,
          packageName: 'com.amazon.mShop.android.shopping',
          bounds: { x: 920, y: 150, width: 80, height: 80 },
        },
      ]);
    }

    setCurrentScreen('current_job');
  };

  const handleApprovePublish = () => {
    setIsApprovalModalOpen(false);
    stateMachine.transitionTo('PUBLISHING');
    logger.log({
      jobId: currentJob?.jobId,
      platform: currentJob?.platform,
      action: 'OPERATOR_APPROVAL_GRANTED',
      details: 'User explicitly confirmed content preview & authorized publish step.',
      severity: 'INFO',
    });
    // Immediately trigger the publishing execution
    setTimeout(() => {
      advanceState();
    }, 400);
  };

  const handleRejectPublish = () => {
    setIsApprovalModalOpen(false);
    stateMachine.transitionTo('STOPPED', 'Operator rejected publish approval.');
    logger.log({
      jobId: currentJob?.jobId,
      platform: currentJob?.platform,
      action: 'OPERATOR_APPROVAL_REJECTED',
      details: 'User rejected publishing step. Pipeline halted.',
      severity: 'WARN',
    });
  };

  return (
    <div
      className={`min-h-screen font-sans antialiased transition-colors ${
        theme === 'light' ? 'bg-neutral-100 text-neutral-900' : 'bg-neutral-950 text-neutral-100'
      }`}
    >
      {/* Top Bar */}
      <MaterialTopBar
        isEmergencyActive={isEmergencyActive}
        onEmergencyStop={handleEmergencyStop}
        onResetEmergencyStop={handleResetEmergencyStop}
        currentJobState={jobState}
        backendConnected={backendConnected}
        theme={theme}
        onToggleTheme={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))}
        activeTab={currentScreen}
      />

      {/* Main Container with Sidebar + Content */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row min-h-[calc(100vh-4rem)]">
        {/* Navigation Sidebar / Rail */}
        <MaterialNavBar
          currentScreen={currentScreen}
          onSelectScreen={setCurrentScreen}
          isEmergencyActive={isEmergencyActive}
          theme={theme}
        />

        {/* Dynamic Screen View */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {currentScreen === 'home' && (
            <HomeScreen
              currentJob={currentJob}
              currentJobState={jobState}
              backendConnected={backendConnected}
              isEmergencyActive={isEmergencyActive}
              onEmergencyStop={handleEmergencyStop}
              onLoadSampleJob={handleLoadSampleJob}
              onNavigateToJob={() => setCurrentScreen('current_job')}
              onNavigateToScreen={setCurrentScreen}
              theme={theme}
            />
          )}

          {currentScreen === 'product_research' && (
            <ProductResearchScreen
              theme={theme}
              onNavigateToContentReview={() => setCurrentScreen('content_review')}
            />
          )}

          {currentScreen === 'content_review' && (
            <ContentReviewScreen
              theme={theme}
              onNavigateToPlan={() => setCurrentScreen('multi_job')}
            />
          )}

          {currentScreen === 'multi_job' && (
            <MultiPlatformJobScreen
              theme={theme}
              onTriggerEmergencyStop={handleEmergencyStop}
            />
          )}

          {currentScreen === 'current_job' && (
            <CurrentJobScreen
              job={currentJob}
              jobState={jobState}
              onAdvanceState={advanceState}
              onAutoRun={startAutoRun}
              onPause={() => setIsPaused(true)}
              onResume={() => setIsPaused(false)}
              onStop={() => stateMachine.transitionTo('STOPPED', 'User clicked Stop')}
              onEmergencyStop={handleEmergencyStop}
              onSimulateTripwire={simulateTripwire}
              onResetJob={() => {
                stateMachine.reset();
                inspector.clearSecurityTripwire();
                setIsEmergencyActive(false);
                setIsAutoRunning(false);
              }}
              isPaused={isPaused}
              isAutoRunning={isAutoRunning}
              theme={theme}
              simulatedNodes={simulatedNodes}
            />
          )}

          {currentScreen === 'apps' && (
            <AppConnectionsScreen
              onTestApp={handleLoadSampleJob}
              theme={theme}
            />
          )}

          {currentScreen === 'settings' && (
            <AutomationSettingsScreen
              backendConfig={backendConfig}
              onUpdateConfig={setBackendConfig}
              theme={theme}
            />
          )}

          {currentScreen === 'logs' && (
            <LogsScreen
              logs={logs}
              onClearLogs={() => logger.clearLogs()}
              onExportLogs={() => {
                const blob = new Blob([logger.exportJson()], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `phone_agent_audit_${Date.now()}.json`;
                a.click();
              }}
              theme={theme}
            />
          )}

          {currentScreen === 'permissions' && (
            <PermissionsScreen theme={theme} />
          )}

          {currentScreen === 'emergency_stop' && (
            <EmergencyStopScreen
              isEmergencyActive={isEmergencyActive}
              stopReason={emergencyReason}
              onTriggerEmergencyStop={handleEmergencyStop}
              onResetEmergencyStop={handleResetEmergencyStop}
              theme={theme}
            />
          )}

          {currentScreen === 'tests' && (
            <TestsScreen theme={theme} />
          )}

          {currentScreen === 'about' && (
            <AboutScreen theme={theme} />
          )}
        </main>
      </div>

      {/* Mandatory User Publish Approval Modal Gate */}
      {currentJob && (
        <PublishApprovalModal
          job={currentJob}
          isOpen={isApprovalModalOpen}
          onApprove={handleApprovePublish}
          onReject={handleRejectPublish}
        />
      )}

      {/* Safety Tripwire Modal */}
      <SecurityAlertModal
        isOpen={isSecurityAlertOpen}
        reason={securityAlertDetails.reason}
        detectedElement={securityAlertDetails.element}
        onDismiss={() => setIsSecurityAlertOpen(false)}
      />
    </div>
  );
}
