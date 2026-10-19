import { Locale } from '@/locales';

/**
 * Browser Web Speech API Text-to-Speech Service
 * Optimized for low-literacy workers in Hindi, Marathi, and English.
 */

export interface SpokenShiftParams {
  marked: boolean;
  projectName?: string;
  punchTime?: string;
  locale: Locale;
}

export interface SpokenBalanceParams {
  unpaidRupees: number;
  totalEarnedRupees: number;
  confirmedPaidRupees: number;
  shiftsCount: number;
  locale: Locale;
}

export interface SpokenContractParams {
  contractorName: string;
  projectName: string;
  dailyWage: number;
  hours: number;
  locale: Locale;
}

export class TextToSpeechService {
  private static synth: SpeechSynthesis | null = null;
  private static activeUtterance: SpeechSynthesisUtterance | null = null;

  private static getSynth(): SpeechSynthesis | null {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      return window.speechSynthesis;
    }
    return null;
  }

  public static isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  public static isSpeaking(): boolean {
    const synth = this.getSynth();
    return synth ? synth.speaking : false;
  }

  public static stop(): void {
    const synth = this.getSynth();
    if (synth) {
      synth.cancel();
      this.activeUtterance = null;
    }
  }

  public static speak(
    text: string,
    locale: Locale,
    onStart?: () => void,
    onEnd?: () => void,
    onError?: (err: any) => void
  ): boolean {
    const synth = this.getSynth();
    if (!synth) {
      if (onError) onError(new Error('SpeechSynthesis not supported'));
      return false;
    }

    try {
      this.stop(); // Stop any active speech

      const utterance = new SpeechSynthesisUtterance(text);
      this.activeUtterance = utterance;

      // Map locale to voice BCP-47 tag
      const langTag = locale === 'hi' ? 'hi-IN' : locale === 'mr' ? 'mr-IN' : 'en-IN';
      utterance.lang = langTag;
      utterance.rate = 0.9; // Slightly slower for clear comprehension
      utterance.pitch = 1.0;

      // Try to find a matching voice in the browser
      const voices = synth.getVoices ? synth.getVoices() : [];
      const matchingVoice = voices.find((v) => v.lang === langTag || v.lang.startsWith(langTag.slice(0, 2)));
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }

      utterance.onstart = () => {
        if (onStart) onStart();
      };

      utterance.onend = () => {
        this.activeUtterance = null;
        if (onEnd) onEnd();
      };

      utterance.onerror = (e) => {
        this.activeUtterance = null;
        if (onError) onError(e);
      };

      synth.speak(utterance);
      return true;
    } catch (err) {
      if (onError) onError(err);
      return false;
    }
  }

  public static buildTodayShiftText(params: SpokenShiftParams): string {
    const { marked, projectName = '', locale } = params;
    const site = projectName || (locale === 'hi' ? 'कार्य स्थल' : locale === 'mr' ? 'कामाचे ठिकाण' : 'work site');

    if (locale === 'hi') {
      return marked
        ? `आज आपकी हाजिरी सत्यापित हो चुकी है। ${site} पर आपकी उपस्थिति दर्ज हो गई है। बहुत बढ़िया!`
        : `आज आपने हाजिरी नहीं लगाई है। कृपया साइट गेट पर जाकर क्यूआर कोड स्कैन करें या छह अंकों का कोड डालकर हाजिरी लगाएं।`;
    }

    if (locale === 'mr') {
      return marked
        ? `आज आपली हजेरी पडताळून नोंदवली गेली आहे. ${site} वर आपली हजेरी नोंद झाली आहे. धन्यवाद!`
        : `आज आपली हजेरी लागलेली नाही. कृपया साइट गेटवर जाऊन क्यूआर कोड स्कॅन करा किंवा ६ अंकी कोड टाकून हजेरी लावा.`;
    }

    return marked
      ? `Your attendance for today has been verified and recorded for ${site}. Great job!`
      : `You have not marked attendance today. Please scan the QR code at the site gate or enter the 6-digit code.`;
  }

  public static buildBalanceText(params: SpokenBalanceParams): string {
    const { unpaidRupees, totalEarnedRupees, confirmedPaidRupees, shiftsCount, locale } = params;

    if (locale === 'hi') {
      return `आपकी कुल बकाया मजदूरी ${unpaidRupees} रुपये है। आपने ${shiftsCount} सत्यापित कार्य दिवसों में कुल ${totalEarnedRupees} रुपये कमाए हैं, और ${confirmedPaidRupees} रुपये का भुगतान आपको प्राप्त हो चुका है।`;
    }

    if (locale === 'mr') {
      return `आपली एकूण थकीत मजुरी ${unpaidRupees} रुपये आहे. आपण ${shiftsCount} प्रमाणित दिवसांत एकूण ${totalEarnedRupees} रुपये कमावले आहेत, आणि ${confirmedPaidRupees} रुपये पेमेंट आपल्याला मिळाले आहे.`;
    }

    return `Your total unpaid wages are ${unpaidRupees} rupees. You have earned ${totalEarnedRupees} rupees across ${shiftsCount} verified work shifts, and have confirmed receiving ${confirmedPaidRupees} rupees.`;
  }

  public static buildContractText(params: SpokenContractParams): string {
    const { contractorName, projectName, dailyWage, hours, locale } = params;

    if (locale === 'hi') {
      return `आपके कार्य अनुबंध में ठेकेदार ${contractorName} द्वारा ${projectName} के लिए प्रतिदिन ${dailyWage} रुपये मजदूरी तय की गई है। रोजाना ${hours} घंटे कार्य करना होगा।`;
    }

    if (locale === 'mr') {
      return `आपल्या कामाच्या करारात कंत्राटदार ${contractorName} कडून ${projectName} साठी दररोज ${dailyWage} रुपये मजुरी ठरली आहे. रोज ${hours} तास काम करायचे आहे.`;
    }

    return `Under your work contract with ${contractorName} for ${projectName}, your daily wage is ${dailyWage} rupees for ${hours} hours of work per day.`;
  }
}
