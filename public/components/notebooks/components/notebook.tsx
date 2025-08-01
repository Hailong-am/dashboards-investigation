/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonIcon,
  EuiCallOut,
  EuiCard,
  EuiContextMenu,
  EuiContextMenuPanelDescriptor,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLoadingContent,
  EuiOverlayMask,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPanel,
  EuiPopover,
  EuiSmallButton,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { FormattedMessage } from '@osd/i18n/react';
import CSS from 'csstype';
import moment from 'moment';
import React, { useState, useEffect, useRef } from 'react';
import { useHistory } from 'react-router-dom';
import { Subscription, timer } from 'rxjs';
import { switchMap, takeWhile } from 'rxjs/operators';

import { useContext } from 'react';
import { useObservable } from 'react-use';
import { useCallback } from 'react';
import { useMemo } from 'react';
import { i18n } from '@osd/i18n';
import { ParagraphState, ParagraphStateValue } from '../../../state/paragraph_state';
import { CoreStart, SavedObjectsStart } from '../../../../../../src/core/public';
import { DashboardStart } from '../../../../../../src/plugins/dashboard/public';
import { DataSourceManagementPluginSetup } from '../../../../../../src/plugins/data_source_management/public';
import {
  CREATE_NOTE_MESSAGE,
  LOG_PATTERN_PARAGRAPH_TYPE,
  NOTEBOOKS_API_PREFIX,
} from '../../../../common/constants/notebooks';
import { UI_DATE_FORMAT } from '../../../../common/constants/shared';
import {
  NotebookContext,
  ParagraphBackendType,
  ParaType,
} from '../../../../common/types/notebooks';
import { setNavBreadCrumbs } from '../../../../common/utils/set_nav_bread_crumbs';
import { HeaderControlledComponentsWrapper } from '../../../plugin_helpers/plugin_headerControl';
import { GenerateReportLoadingModal } from './helpers/custom_modals/reporting_loading_modal';
import { defaultParagraphParser } from './helpers/default_parser';
import { DeleteNotebookModal, getCustomModal, getDeleteModal } from './helpers/modal_containers';
import {
  contextMenuCreateReportDefinition,
  contextMenuViewReports,
  generateInContextReport,
} from './helpers/reporting_context_menu_helper';
import { Paragraphs } from './paragraph_components/paragraphs';
import { ContextPanel } from './context_panel';
import {
  NotebookContextProvider,
  NotebookReactContext,
} from '../context_provider/context_provider';
import { getMLCommonsTask } from '../../../utils/ml_commons_apis';
import { parseParagraphOut } from '../../../utils/paragraph';
import { isStateCompletedOrFailed } from '../../../utils/task';
import { constructDeepResearchParagraphOut } from '../../../../common/utils/paragraph';
import { InputPanel } from './input_panel';
import { useParagraphs } from '../../../hooks/use_paragraphs';
import { isValidUUID } from './helpers/notebooks_parser';
import { useNotebook } from '../../../hooks/use_notebook';

const ParagraphTypeDeepResearch = 'DEEP_RESEARCH';

const panelStyles: CSS.Properties = {
  marginTop: '10px',
};

/*
 * "Notebook" component is used to display an open notebook
 *
 * Props taken in as params are:
 * DashboardContainerByValueRenderer - Dashboard container renderer for visualization
 * http object - for making API requests
 */
export interface NotebookProps {
  openedNoteId: string;
  DashboardContainerByValueRenderer: DashboardStart['DashboardContainerByValueRenderer'];
  http: CoreStart['http'];
  dataSourceManagement: DataSourceManagementPluginSetup;
  notifications: CoreStart['notifications'];
  dataSourceEnabled: boolean;
  savedObjectsMDSClient: SavedObjectsStart;
  chrome: CoreStart['chrome'];
}

export function NotebookComponent({
  DashboardContainerByValueRenderer,
  http,
  dataSourceManagement,
  notifications,
  savedObjectsMDSClient,
  chrome,
}: NotebookProps) {
  const history = useHistory();

  const [selectedViewId] = useState('view_both');
  const [vizPrefix, _setVizPrefix] = useState('');
  const [isReportingPluginInstalled, setIsReportingPluginInstalled] = useState(false);
  const [isReportingActionsPopoverOpen, setIsReportingActionsPopoverOpen] = useState(false);
  const [isReportingLoadingModalOpen, setIsReportingLoadingModalOpen] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalLayout, setModalLayout] = useState<React.ReactNode>(<EuiOverlayMask />);
  const [showQueryParagraphError, setShowQueryParagraphError] = useState(false);
  const [queryParagraphErrorMessage, setQueryParagraphErrorMessage] = useState('');
  const [dataSourceMDSId, setDataSourceMDSId] = useState<string | undefined | null>(null);
  const [dataSourceMDSLabel, setDataSourceMDSLabel] = useState<string | undefined | null>(null);
  const [context] = useState<NotebookContext | undefined>(undefined);
  const { createParagraph, showParagraphRunning, deleteParagraph } = useParagraphs();
  const { loadNotebook: loadNotebookHook, setParagraphs } = useNotebook();
  // Refs for task subscriptions
  const taskSubscriptions = useRef(new Map<string, Subscription>());
  const newNavigation = chrome.navGroup.getNavGroupEnabled();

  const notebookContext = useContext(NotebookReactContext);
  const {
    dataSourceEnabled,
    id: openedNoteId,
    paragraphs: paragraphsStates,
    path,
    dateCreated,
    isLoading,
  } = useObservable(notebookContext.state.getValue$(), notebookContext.state.value);
  const isSavedObjectNotebook = isValidUUID(openedNoteId);
  const paragraphs = paragraphsStates.map((item) => item.value);

  // parse paragraphs based on backend
  const parseParagraphs = useCallback(
    (paragraphsProp: any[]): ParaType[] => {
      try {
        const newParsedPara = defaultParagraphParser(paragraphsProp || []);
        newParsedPara.forEach((para: ParaType) => {
          para.paraDivRef = React.createRef<HTMLDivElement>();
        });
        return newParsedPara;
      } catch (err) {
        notifications.toasts.addDanger(
          'Error parsing paragraphs, please make sure you have the correct permission.'
        );
        return [];
      }
    },
    [notifications.toasts]
  );

  const parsedPara = useMemo(() => parseParagraphs(paragraphs), [paragraphs, parseParagraphs]);
  const dataSourceMDSEnabled = useMemo(() => dataSourceEnabled && isSavedObjectNotebook, [
    dataSourceEnabled,
    isSavedObjectNotebook,
  ]);

  const toggleReportingLoadingModal = (show: boolean) => {
    setIsReportingLoadingModalOpen(show);
  };

  const showDeleteParaModal = (index: number) => {
    setModalLayout(
      getDeleteModal(
        () => setIsModalVisible(false),
        () => {
          deleteParagraph(index);
          setIsModalVisible(false);
        },
        'Delete paragraph',
        'Are you sure you want to delete the paragraph? The action cannot be undone.'
      )
    );
    setIsModalVisible(true);
  };

  // Renames an existing notebook
  const renameNotebook = async (editedNoteName: string, editedNoteID: string): Promise<any> => {
    if (editedNoteName.length >= 50 || editedNoteName.length === 0) {
      notifications.toasts.addDanger('Invalid notebook name');
      return;
    }
    const renameNoteObject = {
      name: editedNoteName,
      noteId: editedNoteID,
    };

    return http
      .put(`${NOTEBOOKS_API_PREFIX}/note/savedNotebook/rename`, {
        body: JSON.stringify(renameNoteObject),
      })
      .then((res) => {
        notifications.toasts.addSuccess(`Notebook successfully renamed into "${editedNoteName}"`);
        return res;
      })
      .catch((err) => {
        notifications.toasts.addDanger(
          'Error renaming notebook, please make sure you have the correct permission.'
        );
        console.error(err.body.message);
      });
  };

  const showRenameModal = () => {
    setModalLayout(
      getCustomModal(
        (newName: string) => {
          renameNotebook(newName, openedNoteId).then((res) => {
            setIsModalVisible(false);
            window.location.assign(`#/${res.id}`);
            setTimeout(() => {
              loadNotebook();
            }, 300);
          });
        },
        () => setIsModalVisible(false),
        'Name',
        'Rename notebook',
        'Cancel',
        'Rename',
        path,
        CREATE_NOTE_MESSAGE
      )
    );
    setIsModalVisible(true);
  };

  // Clones an existing notebook, return new notebook's id
  const cloneNotebook = async (clonedNoteName: string, clonedNoteID: string): Promise<string> => {
    if (clonedNoteName.length >= 50 || clonedNoteName.length === 0) {
      notifications.toasts.addDanger('Invalid notebook name');
      return Promise.reject();
    }
    const cloneNoteObject = {
      name: clonedNoteName,
      noteId: clonedNoteID,
    };

    return http
      .post(`${NOTEBOOKS_API_PREFIX}/note/savedNotebook/clone`, {
        body: JSON.stringify(cloneNoteObject),
      })
      .then((res) => {
        notifications.toasts.addSuccess(`Notebook "${clonedNoteName}" successfully created!`);
        return res.id;
      })
      .catch((err) => {
        notifications.toasts.addDanger(
          'Error cloning notebook, please make sure you have the correct permission.'
        );
        console.error(err.body.message);
      });
  };

  const migrateNotebook = async (
    migrateNoteName: string,
    migrateNoteID: string
  ): Promise<string> => {
    if (migrateNoteName.length >= 50 || migrateNoteName.length === 0) {
      notifications.toasts.addDanger('Invalid notebook name');
      return Promise.reject();
    }
    const migrateNoteObject = {
      name: migrateNoteName,
      noteId: migrateNoteID,
    };
    return http
      .post(`${NOTEBOOKS_API_PREFIX}/note/migrate`, {
        body: JSON.stringify(migrateNoteObject),
      })
      .then((res) => {
        notifications.toasts.addSuccess(`Notebook "${migrateNoteName}" successfully created!`);
        return res.id;
      })
      .catch((err) => {
        notifications.toasts.addDanger(
          'Error migrating notebook, please make sure you have the correct permission.'
        );
        console.error(err.body.message);
      });
  };

  const showCloneModal = () => {
    setModalLayout(
      getCustomModal(
        (newName: string) => {
          cloneNotebook(newName, openedNoteId).then((id: string) => {
            window.location.assign(`#/${id}`);
            setTimeout(() => {
              loadNotebook();
            }, 300);
          });
          setIsModalVisible(false);
        },
        () => setIsModalVisible(false),
        'Name',
        'Duplicate notebook',
        'Cancel',
        'Duplicate',
        path + ' (copy)',
        CREATE_NOTE_MESSAGE
      )
    );
    setIsModalVisible(true);
  };

  const showUpgradeModal = () => {
    setModalLayout(
      getCustomModal(
        (newName: string) => {
          migrateNotebook(newName, openedNoteId).then((id: string) => {
            window.location.assign(`#/${id}`);
            setTimeout(() => {
              loadNotebook();
            }, 300);
          });
          setIsModalVisible(false);
        },
        () => setIsModalVisible(false),
        'Name',
        'Upgrade notebook',
        'Cancel',
        'Upgrade',
        path + ' (upgraded)',
        CREATE_NOTE_MESSAGE
      )
    );
    setIsModalVisible(true);
  };

  // Delete a single notebook
  const deleteSingleNotebook = async (notebookId: string, toastMessage?: string) => {
    const route = isSavedObjectNotebook
      ? `${NOTEBOOKS_API_PREFIX}/note/savedNotebook/${notebookId}`
      : `${NOTEBOOKS_API_PREFIX}/note/${notebookId}`;

    try {
      await http.delete(route);
      const message = toastMessage || 'Notebook successfully deleted!';
      notifications.toasts.addSuccess(message);
    } catch (err) {
      notifications.toasts.addDanger(
        'Error deleting notebook, please make sure you have the correct permission.'
      );
      console.error(err.body.message);
    }
  };

  const showDeleteNotebookModal = () => {
    setModalLayout(
      <DeleteNotebookModal
        onConfirm={async () => {
          const toastMessage = `Notebook "${path}" successfully deleted!`;
          await deleteSingleNotebook(openedNoteId, toastMessage);
          setIsModalVisible(false);
          setTimeout(() => {
            history.push('.');
          }, 1000);
        }}
        onCancel={() => setIsModalVisible(false)}
        title={`Delete notebook "${path}"`}
        message="Delete notebook will remove all contents in the paragraphs."
      />
    );
    setIsModalVisible(true);
  };

  // Function for delete Visualization from notebook
  const deleteVizualization = (uniqueId: string) => {
    http
      .delete(`${NOTEBOOKS_API_PREFIX}/savedNotebook/paragraph/` + openedNoteId + '/' + uniqueId)
      .then((res) => {
        setParagraphs(res.paragraphs);
      })
      .catch((err) => {
        notifications.toasts.addDanger(
          'Error deleting visualization, please make sure you have the correct permission.'
        );
        console.error(err);
      });
  };

  // FIXME
  // Move the method into PPL paragraph
  const loadQueryResultsFromInput = useCallback(
    async (paragraph: any, MDSId?: any) => {
      const queryType =
        paragraph.input.inputText.substring(0, 4) === '%sql' ? 'sqlquery' : 'pplquery';
      const query = {
        dataSourceMDSId: MDSId,
      };
      await http
        .post(`/api/investigation/sql/${queryType}`, {
          body: JSON.stringify(paragraph.output[0].result),
          ...(dataSourceEnabled && { query }),
        })
        .then((response) => {
          paragraph.output[0].result =
            response.data.resp || JSON.stringify({ error: 'no response' });
          return paragraph;
        })
        .catch((err) => {
          notifications.toasts.addDanger('Error getting query output');
          console.error(err);
        });
    },
    [http, notifications.toasts, dataSourceEnabled]
  );

  const scrollToPara = (index: number) => {
    setTimeout(() => {
      window.scrollTo({
        left: 0,
        top: parsedPara[index].paraDivRef.current?.offsetTop,
        behavior: 'smooth',
      });
    }, 0);
  };

  // FIXME
  // Move the method into PER agent paragraph
  const registerDeepResearchParagraphUpdater = useCallback(
    ({
      taskId,
      paraUniqueId,
      agentId,
      baseMemoryId,
    }: {
      taskId: string;
      paraUniqueId: string;
      agentId: string;
      baseMemoryId?: string | undefined;
    }) => {
      const cleanTaskSubscription = () => {
        taskSubscriptions.current.get(taskId)?.unsubscribe();
        taskSubscriptions.current.delete(taskId);
      };
      taskSubscriptions.current.set(
        taskId,
        timer(0, 5000)
          .pipe(
            switchMap(() => {
              const paragraphsValue = notebookContext.state.getParagraphsValue();
              const uniquePara = paragraphsValue.find((para) => para.id === paraUniqueId);
              if (!uniquePara) {
                return 'STOP';
              }
              return getMLCommonsTask({
                http,
                taskId,
                dataSourceId: uniquePara.dataSourceMDSId,
              });
            })
          )
          .pipe(takeWhile((res) => res !== 'STOP' && !isStateCompletedOrFailed(res.state), true))
          .subscribe({
            next: (payload) => {
              const paragraphsValue = notebookContext.state.getParagraphsValue();
              if (payload === 'STOP') {
                cleanTaskSubscription();
                return;
              }
              const currentParsedParaIndex = paragraphsValue.findIndex(
                (para) => para.id === paraUniqueId
              );
              const result = JSON.stringify(
                constructDeepResearchParagraphOut({
                  task: payload,
                  taskId,
                  agentId,
                  baseMemoryId,
                })
              );
              if (
                !isStateCompletedOrFailed(payload.state) &&
                result === JSON.stringify(paragraphsValue[currentParsedParaIndex].output?.[0])
              ) {
                return;
              }
              if (isStateCompletedOrFailed(payload.state)) {
                cleanTaskSubscription();
              }
              http.put(`${NOTEBOOKS_API_PREFIX}/savedNotebook/paragraph`, {
                body: JSON.stringify({
                  noteId: openedNoteId,
                  paragraphId: paraUniqueId,
                  paragraphOutput: [
                    {
                      outputType: 'DEEP_RESEARCH',
                      result,
                    },
                  ],
                }),
              });
            },
            error: (...args) => {
              console.log('Failed to fetch task status', ...args);
              cleanTaskSubscription();
            },
          })
      );
    },
    [http, openedNoteId, notebookContext.state]
  );

  // Backend call to update and run contents of paragraph
  const updateRunParagraph = (
    para: ParaType,
    index: number,
    vizObjectInput?: string,
    paraType?: string,
    _dataSourceMDSId?: string,
    deepResearchAgentId?: string,
    deepResearchBaseMemoryId?: string
  ) => {
    showParagraphRunning(index);
    if (vizObjectInput) {
      para.inp = vizPrefix + vizObjectInput; // "%sh check"
    }

    const paraUpdateObject = {
      noteId: openedNoteId,
      paragraphId: para.uniqueId,
      paragraphInput: para.inp,
      paragraphType: paraType || '',
      dataSourceMDSId: dataSourceMDSId || '',
      dataSourceMDSLabel: dataSourceMDSLabel || '',
      deepResearchAgentId,
      deepResearchBaseMemoryId,
    };
    const route = isSavedObjectNotebook
      ? `${NOTEBOOKS_API_PREFIX}/savedNotebook/paragraph/update/run`
      : `${NOTEBOOKS_API_PREFIX}/paragraph/update/run/`;
    return http
      .post<ParagraphBackendType>(route, {
        body: JSON.stringify(paraUpdateObject),
      })
      .then(async (res) => {
        if (res.output?.[0]?.outputType === 'QUERY') {
          await loadQueryResultsFromInput(res, dataSourceMDSId);
          const checkErrorJSON = JSON.parse(res.output?.[0].result);
          if (checkQueryOutputError(checkErrorJSON)) {
            return;
          }
        }
        const newParagraphs = [...paragraphs];
        const paragraphStateValue = new ParagraphState(res).value;
        const outputPayload = paragraphStateValue.output?.[0];
        newParagraphs[index] = paragraphStateValue;

        if (
          outputPayload?.outputType === 'DEEP_RESEARCH' &&
          newParagraphs[index].uiState &&
          typeof outputPayload.result !== 'string'
        ) {
          newParagraphs[index].uiState.isRunning = true;
          const legacyTaskId = outputPayload.result.task_id as string;
          if (legacyTaskId) {
            taskSubscriptions.current.get(legacyTaskId)?.unsubscribe();
            taskSubscriptions.current.delete(legacyTaskId);
          }
          const taskId = parseParagraphOut(parsedPara[index])[0]?.task_id;
          registerDeepResearchParagraphUpdater({
            taskId,
            paraUniqueId: para.uniqueId,
            agentId: deepResearchAgentId ?? '',
            baseMemoryId: deepResearchBaseMemoryId,
          });
        }
        setParagraphs(newParagraphs);
      })
      .catch((err) => {
        console.log(err);
        if (err?.body?.statusCode === 413)
          notifications.toasts.addDanger(`Error running paragraph: ${err.body.message}`);
        else
          notifications.toasts.addDanger(
            'Error running paragraph, please make sure you have the correct permission.'
          );
      });
  };

  const checkQueryOutputError = (checkErrorJSON: JSON) => {
    // if query output has error output
    if (checkErrorJSON.hasOwnProperty('error')) {
      setShowQueryParagraphError(true);
      setQueryParagraphErrorMessage(checkErrorJSON.error.reason);
      return true;
    }
    // query ran successfully, reset error variables if currently set to true
    else if (showQueryParagraphError) {
      setShowQueryParagraphError(false);
      setQueryParagraphErrorMessage('');
      return false;
    }
  };

  // Handles text editor value and syncs with paragraph input
  const textValueEditor = (evt: React.ChangeEvent<HTMLTextAreaElement>, index: number) => {
    if (!(evt.key === 'Enter' && evt.shiftKey)) {
      const newParas = [...paragraphs];
      newParas[index].input = newParas[index].input || {};
      newParas[index].input.inputText = evt.target.value;
      setParagraphs(newParas);
    }
  };

  // Handles run paragraph shortcut "Shift+Enter"
  const handleKeyPress = (evt: React.KeyboardEvent<Element>, para: ParaType, index: number) => {
    if (evt.key === 'Enter' && evt.shiftKey) {
      updateRunParagraph(para, index);
    }
  };

  const setBreadcrumbs = useCallback(
    (notePath: string) => {
      setNavBreadCrumbs(
        [],
        [
          {
            text: 'Notebooks',
            href: '#/',
          },
          {
            text: notePath,
            href: `#/${openedNoteId}`,
          },
        ]
      );
    },
    [openedNoteId]
  );

  const loadNotebook = useCallback(async () => {
    loadNotebookHook()
      .then(async (res) => {
        setBreadcrumbs(res.path);
        let index = 0;
        let logPatternParaExists = false;
        let bubbleUpParaExists = false;
        for (index = 0; index < res.paragraphs.length; ++index) {
          // if the paragraph is a query, load the query output
          if (
            res.paragraphs[index].output[0]?.outputType === 'QUERY' &&
            dataSourceEnabled &&
            res.paragraphs[index].dataSourceMDSId
          ) {
            await loadQueryResultsFromInput(
              res.paragraphs[index],
              res.paragraphs[index].dataSourceMDSId
            );
          } else if (
            res.paragraphs[index].output[0]?.outputType === 'QUERY' &&
            !dataSourceEnabled &&
            res.paragraphs[index].dataSourceMDSId
          ) {
            res.paragraphs[index].output[0] = [];
            notifications.toasts.addDanger(
              `Data source ${res.paragraphs[index].dataSourceMDSLabel} is not available. Please configure your dataSources`
            );
          } else if (
            res.paragraphs[index].output[0]?.outputType === 'QUERY' &&
            !isSavedObjectNotebook
          ) {
            await loadQueryResultsFromInput(res.paragraphs[index]);
          } else if (res.paragraphs[index].output[0]?.outputType === 'QUERY') {
            await loadQueryResultsFromInput(res.paragraphs[index], '');
          } else if (res.paragraphs[index].output[0]?.outputType === 'DEEP_RESEARCH') {
            const currentResult = res.paragraphs[index].output[0]?.result;
            if (!currentResult) {
              continue;
            }
            const {
              task_id: taskId,
              agent_id: agentId,
              state,
              base_memory_id: baseMemoryId,
            } = JSON.parse(currentResult);
            const paragraphId = res.paragraphs[index].id;

            if (isStateCompletedOrFailed(state)) {
              continue;
            }

            registerDeepResearchParagraphUpdater({
              taskId,
              agentId,
              paraUniqueId: paragraphId,
              baseMemoryId,
            });
          } else if (res.paragraphs[index].input.inputType === LOG_PATTERN_PARAGRAPH_TYPE) {
            logPatternParaExists = true;
          } else if (res.paragraphs[index].input.inputType === 'ANOMALY_VISUALIZATION_ANALYSIS') {
            bubbleUpParaExists = true;
          }
        }

        notebookContext.state.updateParagraphs(res.paragraphs);
        if (!bubbleUpParaExists) {
          const resContext = res.context;
          if (resContext?.filters && resContext?.timeRange && resContext?.index) {
            await createParagraph(0, '', 'ANOMALY_VISUALIZATION_ANALYSIS');
          }
        }
        if (!logPatternParaExists) {
          const resContext = res.context as NotebookContext;
          if (resContext?.timeRange && resContext?.index && resContext?.timeField) {
            await createParagraph(1, '', LOG_PATTERN_PARAGRAPH_TYPE);
          }
        }
      })
      .catch((err) => {
        notifications.toasts.addDanger(
          'Error fetching notebooks, please make sure you have the correct permission.'
        );
        console.error(err);
      });
  }, [
    loadNotebookHook,
    setBreadcrumbs,
    createParagraph,
    notifications.toasts,
    loadQueryResultsFromInput,
    registerDeepResearchParagraphUpdater,
    dataSourceEnabled,
    isSavedObjectNotebook,
    notebookContext.state,
  ]);

  const handleSelectedDataSourceChange = (id: string | undefined, label: string | undefined) => {
    setDataSourceMDSId(id);
    setDataSourceMDSLabel(label);
  };

  const setPara = (para: ParagraphStateValue, index: number) => {
    const newParas = [...paragraphs];
    newParas.splice(index, 1, para);
    setParagraphs(newParas);
  };

  const checkIfReportingPluginIsInstalled = useCallback(() => {
    fetch('../api/status', {
      headers: {
        'Content-Type': 'application/json',
        'osd-xsrf': 'true',
        'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7,zh-TW;q=0.6',
        pragma: 'no-cache',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
      },
      method: 'GET',
      referrerPolicy: 'strict-origin-when-cross-origin',
      mode: 'cors',
      credentials: 'include',
    })
      .then(function (response) {
        return response.json();
      })
      .then((data) => {
        for (let i = 0; i < data.status.statuses.length; ++i) {
          if (data.status.statuses[i].id.includes('plugin:reportsDashboards')) {
            setIsReportingPluginInstalled(true);
          }
        }
      })
      .catch((error) => {
        notifications.toasts.addDanger('Error checking Reporting Plugin Installation status.');
        console.error(error);
      });
  }, [notifications.toasts]);

  useEffect(() => {
    setBreadcrumbs('');
    loadNotebook();
    checkIfReportingPluginIsInstalled();
  }, [setBreadcrumbs, loadNotebook, checkIfReportingPluginIsInstalled]);

  const reportingActionPanels: EuiContextMenuPanelDescriptor[] = [
    {
      id: 0,
      title: 'Reporting',
      items: [
        {
          name: 'Download PDF',
          icon: <EuiIcon type="download" data-test-subj="download-notebook-pdf" />,
          onClick: () => {
            setIsReportingActionsPopoverOpen(false);
            generateInContextReport('pdf', { http, notifications }, toggleReportingLoadingModal);
          },
        },
        {
          name: 'Download PNG',
          icon: <EuiIcon type="download" />,
          onClick: () => {
            setIsReportingActionsPopoverOpen(false);
            generateInContextReport('png', { http, notifications }, toggleReportingLoadingModal);
          },
        },
        {
          name: 'Create report definition',
          icon: <EuiIcon type="calendar" />,
          onClick: () => {
            setIsReportingActionsPopoverOpen(false);
            contextMenuCreateReportDefinition(window.location.href);
          },
        },
        {
          name: 'View reports',
          icon: <EuiIcon type="document" />,
          onClick: () => {
            setIsReportingActionsPopoverOpen(false);
            contextMenuViewReports();
          },
        },
      ],
    },
  ];

  const showReportingContextMenu =
    isReportingPluginInstalled && !dataSourceMDSEnabled ? (
      <div>
        <EuiPopover
          panelPaddingSize="none"
          button={
            <EuiSmallButton
              data-test-subj="reporting-actions-button"
              id="reportingActionsButton"
              iconType="arrowDown"
              iconSide="right"
              onClick={() => setIsReportingActionsPopoverOpen(!isReportingActionsPopoverOpen)}
            >
              Reporting
            </EuiSmallButton>
          }
          isOpen={isReportingActionsPopoverOpen}
          closePopover={() => setIsReportingActionsPopoverOpen(false)}
        >
          <EuiContextMenu initialPanelId={0} panels={reportingActionPanels} size="s" />
        </EuiPopover>
      </div>
    ) : null;

  const showLoadingModal = isReportingLoadingModalOpen ? (
    <GenerateReportLoadingModal setShowLoading={toggleReportingLoadingModal} />
  ) : null;

  const noteActionIcons = (
    <EuiFlexGroup gutterSize="s">
      {isSavedObjectNotebook ? (
        <>
          <EuiFlexItem grow={false}>
            <EuiToolTip
              content={
                <FormattedMessage id="notebook.deleteButton.tooltip" defaultMessage="Delete" />
              }
            >
              <EuiButtonIcon
                color="danger"
                display="base"
                iconType="trash"
                size="s"
                onClick={showDeleteNotebookModal}
                data-test-subj="notebook-delete-icon"
                aria-label={i18n.translate('notebook.deleteButton.tooltip', {
                  defaultMessage: 'Delete',
                })}
              />
            </EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip
              content={
                <FormattedMessage id="notebook.editButton.tooltip" defaultMessage="Edit name" />
              }
            >
              <EuiButtonIcon
                display="base"
                iconType="pencil"
                size="s"
                onClick={showRenameModal}
                data-test-subj="notebook-edit-icon"
                aria-label={i18n.translate('notebook.editButton.tooltip', {
                  defaultMessage: 'Edit name',
                })}
              />
            </EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip
              content={
                <FormattedMessage
                  id="notebook.duplicateButton.tooltip"
                  defaultMessage="Duplicate"
                />
              }
            >
              <EuiButtonIcon
                iconType="copy"
                display="base"
                size="s"
                onClick={showCloneModal}
                data-test-subj="notebook-duplicate-icon"
                aria-label={i18n.translate('notebook.duplicateButton.tooltip', {
                  defaultMessage: 'Duplicate',
                })}
              />
            </EuiToolTip>
          </EuiFlexItem>
        </>
      ) : (
        <>
          <EuiFlexItem grow={false}>
            <EuiToolTip
              content={
                <FormattedMessage id="notebook.deleteButton.tooltip" defaultMessage="Delete" />
              }
            >
              <EuiButtonIcon
                color="danger"
                display="base"
                iconType="trash"
                size="s"
                onClick={showDeleteNotebookModal}
                data-test-subj="notebook-delete-icon"
                aria-label={i18n.translate('notebook.deleteButton.tooltip', {
                  defaultMessage: 'Delete',
                })}
              />
            </EuiToolTip>
          </EuiFlexItem>
        </>
      )}
    </EuiFlexGroup>
  );

  const handleCreateParagraph = async (paragraphInput: string, inputType: string) => {
    // Add paragraph at the end
    await createParagraph(paragraphs.length, paragraphInput, inputType);
  };

  const reportingTopButton = !isSavedObjectNotebook ? (
    <EuiFlexItem grow={false}>
      <EuiSmallButton
        fill
        data-test-subj="upgrade-notebook-callout"
        onClick={() => showUpgradeModal()}
      >
        Upgrade Notebook
      </EuiSmallButton>
    </EuiFlexItem>
  ) : null;

  const notebookHeader = newNavigation ? (
    <HeaderControlledComponentsWrapper
      description={`Created on ${moment(dateCreated).format(UI_DATE_FORMAT)}`}
      components={[
        noteActionIcons,
        <EuiFlexItem grow={false}>{showReportingContextMenu}</EuiFlexItem>,
        <EuiFlexItem grow={false}>{reportingTopButton}</EuiFlexItem>,
      ]}
    />
  ) : (
    <div>
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" gutterSize="s">
        <EuiTitle size="l">
          <h3 data-test-subj="notebookTitle">{path}</h3>
        </EuiTitle>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s" alignItems="center">
            {noteActionIcons}
            <EuiFlexItem grow={false}>{showReportingContextMenu}</EuiFlexItem>
            <EuiFlexItem grow={false}>{reportingTopButton}</EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
        <EuiFlexItem grow={false}>
          <p>{`Created on ${moment(dateCreated).format(UI_DATE_FORMAT)}`}</p>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
    </div>
  );

  return (
    <>
      <EuiPage direction="column">
        <EuiPageBody>
          {notebookHeader}
          {!isSavedObjectNotebook && (
            <EuiFlexItem>
              <EuiCallOut color="primary" iconType="iInCircle">
                Upgrade this notebook to take full advantage of the latest features
                <EuiSpacer size="s" />
                <EuiSmallButton
                  data-test-subj="upgrade-notebook"
                  onClick={() => showUpgradeModal()}
                >
                  Upgrade Notebook
                </EuiSmallButton>
              </EuiCallOut>
            </EuiFlexItem>
          )}
          <EuiPageContent style={{ width: 900 }} horizontalPosition="center">
            {isLoading ? (
              <EuiEmptyPrompt icon={<EuiLoadingContent />} title={<h2>Loading Notebook</h2>} />
            ) : null}
            {/* Temporarily determine whether to display the context panel based on datasource id */}
            {context?.dataSourceId && <ContextPanel addPara={createParagraph} />}
            {isLoading ? null : parsedPara.length > 0 ? (
              parsedPara.map((para: ParaType, index: number) => (
                <div ref={parsedPara[index].paraDivRef} key={`para_div_${para.uniqueId}`}>
                  <Paragraphs
                    para={para}
                    originalPara={paragraphs[index]}
                    setPara={(pr: ParagraphStateValue) => setPara(pr, index)}
                    index={index}
                    paraCount={parsedPara.length}
                    textValueEditor={textValueEditor}
                    handleKeyPress={handleKeyPress}
                    DashboardContainerByValueRenderer={DashboardContainerByValueRenderer}
                    deleteVizualization={deleteVizualization}
                    http={http}
                    selectedViewId={selectedViewId}
                    deletePara={showDeleteParaModal}
                    runPara={updateRunParagraph}
                    showQueryParagraphError={showQueryParagraphError}
                    queryParagraphErrorMessage={queryParagraphErrorMessage}
                    dataSourceManagement={dataSourceManagement}
                    notifications={notifications}
                    dataSourceEnabled={dataSourceMDSEnabled}
                    savedObjectsMDSClient={savedObjectsMDSClient}
                    handleSelectedDataSourceChange={handleSelectedDataSourceChange}
                    paradataSourceMDSId={parsedPara[index].dataSourceMDSId}
                    dataSourceMDSLabel={parsedPara[index].dataSourceMDSLabel}
                    paragraphs={parsedPara}
                    scrollToPara={scrollToPara}
                  />
                </div>
              ))
            ) : (
              // show default paragraph if no paragraphs in this notebook
              <div style={panelStyles}>
                <EuiPanel>
                  <EuiSpacer size="xxl" />
                  <EuiText textAlign="center">
                    <h2>No paragraphs</h2>
                    <EuiText size="s">
                      Add a paragraph to compose your document or story. Notebooks now support two
                      types of input:
                    </EuiText>
                  </EuiText>
                  <EuiSpacer size="xl" />
                  {isSavedObjectNotebook && (
                    <EuiFlexGroup justifyContent="spaceEvenly">
                      <EuiFlexItem grow={2} />
                      <EuiFlexItem grow={3}>
                        <EuiCard
                          icon={<EuiIcon size="xxl" type="editorCodeBlock" />}
                          title="Code block"
                          description="Write contents directly using markdown, SQL or PPL."
                          footer={
                            <EuiSmallButton
                              data-test-subj="emptyNotebookAddCodeBlockBtn"
                              onClick={() => createParagraph(0, '', 'CODE')}
                              style={{ marginBottom: 17 }}
                            >
                              Add code block
                            </EuiSmallButton>
                          }
                        />
                      </EuiFlexItem>
                      <EuiFlexItem grow={3}>
                        <EuiCard
                          icon={<EuiIcon size="xxl" type="visArea" />}
                          title="Visualization"
                          description="Import OpenSearch Dashboards or Observability visualizations to the notes."
                          footer={
                            <EuiSmallButton
                              onClick={() => createParagraph(0, '', 'VISUALIZATION')}
                              style={{ marginBottom: 17 }}
                            >
                              Add visualization
                            </EuiSmallButton>
                          }
                        />
                      </EuiFlexItem>
                      <EuiFlexItem grow={3}>
                        <EuiCard
                          icon={<EuiIcon size="xxl" type="inspect" />}
                          title="Deep Research"
                          description="Use deep research to analytics question."
                          footer={
                            <EuiSmallButton
                              onClick={() => createParagraph(0, '', ParagraphTypeDeepResearch)}
                              style={{ marginBottom: 17 }}
                            >
                              Add deep research
                            </EuiSmallButton>
                          }
                        />
                      </EuiFlexItem>
                      <EuiFlexItem grow={2} />
                    </EuiFlexGroup>
                  )}
                  <EuiSpacer size="xxl" />
                </EuiPanel>
              </div>
            )}
            {showLoadingModal}
          </EuiPageContent>
        </EuiPageBody>
        <EuiSpacer />
        <InputPanel onCreateParagraph={handleCreateParagraph} />
      </EuiPage>
      {isModalVisible && modalLayout}
    </>
  );
}

export const Notebook = (props: NotebookProps) => {
  return (
    <NotebookContextProvider
      notebookId={props.openedNoteId}
      http={props.http}
      dataSourceEnabled={props.dataSourceEnabled}
    >
      <NotebookComponent {...props} />
    </NotebookContextProvider>
  );
};
