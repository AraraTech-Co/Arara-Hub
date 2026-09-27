/***
 *
 *   VIEW
 *   The view houses global components that are common to all views
 *   (notification, modal), handles errors and renders the layout
 *
 **********/

import { useState, createContext, SetStateAction, Dispatch } from "react";
import {
  AppLayout,
  AuthLayout,
  HomeLayout,
  OnboardingLayout,
  Modal,
  Notification,
  Loader,
  useNavigate,
} from "../lib";

// import './scss/normalize.scss';
// import './scss/view.scss';
// import './scss/typography.scss';

// TODO: Fix Context
// Check reason here:
// https://github.com/DefinitelyTyped/DefinitelyTyped/pull/24509#issuecomment-382213106

type ViewContextType = {
  notification: {
    show: (text, type, autoclose, format?, icon?) => void;
    hide: () => void;
    data: NotificationState;
  },
  modal: {
    show: (content, callback) => void;
    hide: (cancel?, res?) => void;
    data: ModalState;
  },

  setLoading: Dispatch<SetStateAction<boolean>>;
  handleError: (err) => void;
}

export const ViewContext = createContext<ViewContextType>(undefined);

interface NotificationState {
  text?: string;
  type?: string;
  show?: boolean;
  format?: string | null;
  icon?: string | null;
  autoclose: boolean;
  visible?: string;
}

interface ModalState {
  [key: string]: any;
}

export function View(props) {
  const navigate = useNavigate();

  // state
  const [notification, setNotification] = useState<NotificationState>({
    visible: "hide",
    autoclose: true,
  });
  const [modal, setModal] = useState<ModalState>({});
  const [loading, setLoading] = useState(false);

  // layouts
  const layouts = {
    app: AppLayout,
    home: HomeLayout,
    auth: AuthLayout,
    onboarding: OnboardingLayout,
  };

  // set title & layout
  document.title = props.title;
  let Layout = props.layout ? layouts[props.layout] : AppLayout;

  if (!props.display) return null;

  function showNotification(text, type, autoclose, format = null, icon = null) {
    setNotification({
      text: text,
      type: type,
      show: true,
      format: format,
      icon: icon,
      autoclose: autoclose,
    });

    if (autoclose) setTimeout(hideNotification, 2000);
  }

  function hideNotification() {
    setNotification({
      text: "",
      type: "",
      show: false,
      format: null,
      icon: null,
      autoclose: true,
    });
  }

  function showModal(content, callback) {
    let data = { ...modal };

    if (content) {
      for (let key in content) data[key] = content[key];

      data.show = true;
      data.callback = callback;
    }

    setModal(data);
  }

  function hideModal(cancel, res) {
    // callback?
    if (!cancel && modal.callback) modal.callback(modal.form, res);

    // reset the modal
    setModal({
      title: null,
      text: null,
      buttonText: null,
      url: null,
      method: null,
      show: false,
    });
  }

  function handleError(err) {
    let message = "There was a glitch in the matrix – please try again";

    if (err) {
      message = err.toString();

      if (err.response) {
        if (err.response.data?.message) message = err.response.data.message;

        if (err.response.status) {
          switch (err.response.status) {
            case 401:
              navigate("/signin");
              break;

            case 404:
              navigate("/notfound");
              break;

            case 429:
              showNotification(err.response.data, "error", false);
              break;

            case 402: // payment required
              navigate("/account/upgrade?plan=" + err.response.data.plan);
              break;

            default:
              showNotification(message, "error", false);
              break;
          }
        }
      } else {
        showNotification(message, "error", false);
      }
    }
  }

  const context = {
    notification: {
      show: showNotification,
      hide: hideNotification,
      data: notification,
    },
    modal: {
      show: showModal,
      hide: hideModal,
      data: modal,
    },

    setLoading,
    handleError,
  };

  return (
    <ViewContext.Provider value={context}>
      {notification.show && <Notification {...notification} />}

      {loading && <Loader fullScreen />}

      {modal.show && <Modal {...modal} />}

      <Layout title={props.title} data={props.data}>
        {props.display}
      </Layout>
    </ViewContext.Provider>
  );
}
