/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiComboBoxOptionOption,
  EuiCompressedFormRow,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLink,
  EuiPanel,
  EuiSmallButton,
  EuiSpacer,
  EuiText,
  EuiToolTip,
  htmlIdGenerator,
} from '@elastic/eui';
import filter from 'lodash/filter';
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useCallback } from 'react';
import {
  CoreStart,
  SavedObjectsFindOptions,
  SavedObjectsStart,
} from '../../../../../../../src/core/public';
import {
  DashboardContainerInput,
  DashboardStart,
} from '../../../../../../../src/plugins/dashboard/public';
import { DataSourceManagementPluginSetup } from '../../../../../../../src/plugins/data_source_management/public';
import { ViewMode } from '../../../../../../../src/plugins/embeddable/public';
import { NOTEBOOKS_API_PREFIX } from '../../../../../common/constants/notebooks';
import {
  PPL_DOCUMENTATION_URL,
  SQL_DOCUMENTATION_URL,
} from '../../../../../common/constants/shared';
import { ParaType } from '../../../../../common/types/notebooks';
import { uiSettingsService } from '../../../../../common/utils';
import { dataSourceFilterFn } from '../../../../../common/utils/shared';
import { coreRefs } from '../../../../framework/core_refs';
import { SavedObjectsActions } from '../../../../services/saved_objects/saved_object_client/saved_objects_actions';
import { ObservabilitySavedVisualization } from '../../../../services/saved_objects/saved_object_client/types';
import { parseParagraphOut } from '../../../../utils/paragraph';
import { ParaInput } from './para_input';
import { ParaOutput } from './para_output';
import { AgentsSelector } from './agents_selector';
import { MemorySelector } from './memory_selector';
import { DataSourceSelectorProps } from '../../../../../../../src/plugins/data_source_management/public/components/data_source_selector/data_source_selector';
import { ParagraphActionPanel } from './paragraph_actions_panel';
import { ParagraphStateValue } from '../../../../state/paragraph_state';

/*
 * "Paragraphs" component is used to render cells of the notebook open and "add para div" between paragraphs
 *
 * Props taken in as params are:
 * para - parsed paragraph from notebook
 * index - index of paragraph in the notebook
 * textValueEditor - function for handling input in textarea
 * handleKeyPress - function for handling key press like "Shift-key+Enter" to run paragraph
 * DashboardContainerByValueRenderer - Dashboard container renderer for visualization
 * deleteVizualization - function to delete a para
 * http object - for making API requests
 * selectedViewId - selected view: view_both, input_only, output_only
 * runPara - function to run the selected para
 * clearPara - function to clear output of all the paras
 *
 * Cell component of nteract used as a container for paragraphs in notebook UI.
 * https://components.nteract.io/#cell
 */
interface ParagraphProps {
  para: ParaType;
  originalPara: ParagraphStateValue;
  setPara: (para: ParagraphStateValue) => void;
  index: number;
  textValueEditor: (evt: React.ChangeEvent<HTMLTextAreaElement>, index: number) => void;
  handleKeyPress: (
    evt: React.KeyboardEvent<Element>,
    para: ParaType,
    index: number,
    dataSourceMDSID: string
  ) => void;
  DashboardContainerByValueRenderer: DashboardStart['DashboardContainerByValueRenderer'];
  deleteVizualization: (uniqueId: string) => void;
  http: CoreStart['http'];
  selectedViewId: string;
  deletePara: (index: number) => void;
  runPara: (
    para: ParaType,
    index: number,
    vizObjectInput?: string,
    paraType?: string,
    dataSourceMDSId?: string,
    deepResearchAgentId?: string,
    deepResearchBaseMemoryId?: string
  ) => void;
  showQueryParagraphError: boolean;
  queryParagraphErrorMessage: string;
  dataSourceManagement: DataSourceManagementPluginSetup;
  notifications: CoreStart['notifications'];
  dataSourceEnabled: boolean;
  savedObjectsMDSClient: SavedObjectsStart;
  handleSelectedDataSourceChange: (
    dataSourceMDSId: string | undefined,
    dataSourceMDSLabel: string | undefined
  ) => void;
  paradataSourceMDSId: string;
  dataSourceMDSLabel: string;
  paragraphs: ParaType[];
  scrollToPara: (idx: number) => void;
}

export const Paragraphs = forwardRef((props: ParagraphProps, ref) => {
  const {
    para,
    index,
    textValueEditor,
    handleKeyPress,
    DashboardContainerByValueRenderer,
    showQueryParagraphError,
    queryParagraphErrorMessage,
    http,
    dataSourceEnabled,
    dataSourceManagement,
    notifications,
    savedObjectsMDSClient,
    handleSelectedDataSourceChange,
    paradataSourceMDSId,
    scrollToPara,
    deletePara,
  } = props;

  const [visOptions, setVisOptions] = useState<EuiComboBoxOptionOption[]>([
    { label: 'Dashboards Visualizations', options: [] },
    { label: 'Observability Visualizations', options: [] },
  ]); // options for loading saved visualizations
  const [runParaError, setRunParaError] = useState(false);
  const [selectedVisOption, setSelectedVisOption] = useState<EuiComboBoxOptionOption[]>([]);
  const [visInput, setVisInput] = useState(undefined);
  const [visType, setVisType] = useState('');
  const [dataSourceMDSId, setDataSourceMDSId] = useState('');
  const shouldSkipAgentIdResetRef = useRef(true);
  const memoryIds = useMemo(
    () =>
      new Array(
        ...new Set(
          props.paragraphs
            .filter((paragraph) => paragraph.isDeepResearch)
            .map((paragraph) => parseParagraphOut(paragraph)[0]?.memory_id)
            .filter((memoryId) => !!memoryId)
        )
      ),
    [props.paragraphs]
  );
  const parsedParagraphOut = useMemo(() => parseParagraphOut(para), [para]);
  const [deepResearchAgentId, setDeepResearchAgentId] = useState<string | undefined>(
    parsedParagraphOut[0]?.agent_id
  );
  const [deepResearchBaseMemoryId, setDeepResearchBaseMemoryId] = useState<string | undefined>(
    parsedParagraphOut[0]?.base_memory_id
  );
  const deepResearchMemoryId = parsedParagraphOut[0]?.memory_id;

  // output is available if it's not cleared and vis paragraph has a selected visualization
  const isOutputAvailable =
    (para.out.length > 0 && para.out[0] !== '') ||
    (para.isVizualisation && para.typeOut.length > 0 && visInput !== undefined) ||
    para.isAnomalyVisualizationAnalysis ||
    para.isLogPattern;

  useImperativeHandle(ref, () => ({
    runParagraph() {
      return onRunPara();
    },
  }));

  const fetchVisualizations = useCallback(async () => {
    if (dataSourceEnabled) {
      let opts: EuiComboBoxOptionOption[] = [];
      const vizOptions: SavedObjectsFindOptions = {
        type: 'visualization',
      };
      await coreRefs.savedObjectsClient
        ?.find(vizOptions)
        .then((res) => {
          opts = res.savedObjects.map((vizObject) => ({
            label: vizObject.attributes.title,
            key: vizObject.id,
            className: 'VISUALIZATION',
          }));
        })
        .catch((error) => {
          console.error('Failed to fetch visualizations', error);
        });

      const allVisualizations = [{ label: 'Dashboards Visualizations', options: opts }];
      setVisOptions(allVisualizations);

      const selectedObject = filter([...opts], {
        key: para.visSavedObjId,
      });
      if (selectedObject.length > 0) {
        setVisType(selectedObject[0].className ?? 'VISUALIZATION');
        setSelectedVisOption(selectedObject);
      }
    } else {
      let opt1: EuiComboBoxOptionOption[] = [];
      let opt2: EuiComboBoxOptionOption[] = [];
      await http
        .get(`${NOTEBOOKS_API_PREFIX}/visualizations/${dataSourceMDSId ?? ''}`)
        .then((res) => {
          opt1 = res.savedVisualizations.map((vizObject) => ({
            label: vizObject.label,
            key: vizObject.key,
            className: 'VISUALIZATION',
          }));
        })
        .catch((err) => console.error('Fetching dashboard visualization issue', err.body.message));

      await SavedObjectsActions.getBulk<ObservabilitySavedVisualization>({
        objectType: ['savedVisualization'],
      })
        .then((res) => {
          opt2 = res.observabilityObjectList
            .filter((visualization) => !visualization.savedVisualization.application_id)
            .map((visualization) => ({
              label: visualization.savedVisualization.name,
              key: visualization.objectId,
              className: 'OBSERVABILITY_VISUALIZATION',
            }));
        })
        .catch((err) => console.error('Fetching observability visualization issue', err));

      const allVisualizations = [
        { label: 'Dashboards Visualizations', options: opt1 },
        { label: 'Observability Visualizations', options: opt2 },
      ];
      setVisOptions(allVisualizations);

      const selectedObject = filter([...opt1, ...opt2], {
        key: para.visSavedObjId,
      });
      if (selectedObject.length > 0) {
        setVisType(selectedObject[0].className ?? 'VISUALIZATION');
        setSelectedVisOption(selectedObject);
      }
    }
  }, [dataSourceEnabled, dataSourceMDSId, http, para.visSavedObjId]);

  useEffect(() => {
    if (para.isVizualisation) {
      if (para.visSavedObjId !== '') setVisInput(JSON.parse(para.vizObjectInput));
      fetchVisualizations();
    }
  }, [
    dataSourceMDSId,
    fetchVisualizations,
    para.isVizualisation,
    para.visSavedObjId,
    para.vizObjectInput,
  ]);

  const createDashboardVizObject = (objectId: string) => {
    const vizUniqueId = htmlIdGenerator()();
    // a dashboard container object for new visualization
    const newVizObject: DashboardContainerInput = {
      viewMode: ViewMode.VIEW,
      panels: {
        '1': {
          gridData: {
            x: 0,
            y: 0,
            w: 50,
            h: 20,
            i: '1',
          },
          type: 'visualization',
          explicitInput: {
            id: '1',
            savedObjectId: objectId,
          },
        },
      },
      isFullScreenMode: false,
      filters: [],
      useMargins: false,
      id: vizUniqueId,
      timeRange: {
        to: para.visEndTime,
        from: para.visStartTime,
      },
      title: 'embed_viz_' + vizUniqueId,
      query: {
        query: '',
        language: 'lucene',
      },
      refreshConfig: {
        pause: true,
        value: 15,
      },
    };
    return newVizObject;
  };

  const onRunPara = () => {
    if (
      (!para.isVizualisation && !para.inp) ||
      (para.isVizualisation && selectedVisOption.length === 0)
    ) {
      setRunParaError(true);
      return;
    }
    let newVisObjectInput;
    if (para.isVizualisation) {
      const inputTemp = createDashboardVizObject(selectedVisOption[0].key);
      setVisInput(inputTemp);
      setRunParaError(false);
      newVisObjectInput = JSON.stringify(inputTemp);
    }
    setRunParaError(false);
    return props.runPara(
      para,
      index,
      newVisObjectInput,
      visType,
      dataSourceMDSId,
      deepResearchAgentId,
      deepResearchBaseMemoryId
    );
  };

  const setStartTime = (time: string) => {
    const newPara = props.originalPara;
    const { timeRange, ...others } = JSON.parse(newPara.input.inputText);
    timeRange.from = time;
    newPara.input.inputText = JSON.stringify({
      ...others,
      timeRange,
    });
    props.setPara(newPara);
  };
  const setEndTime = (time: string) => {
    const newPara = props.originalPara;
    const { timeRange, ...others } = JSON.parse(newPara.input.inputText);
    timeRange.to = time;
    newPara.input.inputText = JSON.stringify({
      ...others,
      timeRange,
    });
    props.setPara(newPara);
  };
  const setIsOutputStale = (isStale: boolean) => {
    const newPara = props.originalPara;
    newPara.uiState.isOutputStale = isStale;
    props.setPara(newPara);
  };

  // do not show output if it is a visualization paragraph and visInput is not loaded yet
  const paraOutput = (!para.isVizualisation ||
    visInput ||
    para.isAnomalyVisualizationAnalysis ||
    para.isLogPattern) && (
    <ParaOutput
      index={index}
      http={http}
      key={para.uniqueId}
      para={para}
      visInput={visInput}
      setVisInput={setVisInput}
      DashboardContainerByValueRenderer={DashboardContainerByValueRenderer}
    />
  );

  // do not show input and EuiPanel if view mode is output_only
  if (props.selectedViewId === 'output_only') {
    return paraOutput;
  }

  const sqlIcon = (
    <>
      <EuiLink href={SQL_DOCUMENTATION_URL} target="_blank">
        SQL
      </EuiLink>{' '}
    </>
  );

  const pplIcon = (
    <>
      <EuiLink href={PPL_DOCUMENTATION_URL} target="_blank">
        PPL
      </EuiLink>{' '}
    </>
  );

  const paragraphLabel = !para.isVizualisation ? (
    <EuiText size="s">
      Specify the input language on the first line using %[language type]. Supported languages
      include markdown, {sqlIcon} and {pplIcon}.
    </EuiText>
  ) : null;

  const queryErrorMessage = queryParagraphErrorMessage.includes('SQL') ? (
    <EuiText size="s">
      {queryParagraphErrorMessage}. Learn More{' '}
      <EuiLink href={SQL_DOCUMENTATION_URL} target="_blank">
        <EuiIcon type="popout" size="s" />
      </EuiLink>
    </EuiText>
  ) : (
    <EuiText size="s">
      {queryParagraphErrorMessage}.{' '}
      <EuiLink href={PPL_DOCUMENTATION_URL} target="_blank">
        Learn More <EuiIcon type="popout" size="s" />
      </EuiLink>
    </EuiText>
  );

  const paraClass = `notebooks-paragraph notebooks-paragraph-${
    uiSettingsService.get('theme:darkMode') ? 'dark' : 'light'
  }`;
  const DataSourceSelector: React.ComponentType<DataSourceSelectorProps> = dataSourceEnabled
    ? (dataSourceManagement.ui.DataSourceSelector as React.ComponentType<DataSourceSelectorProps>)
    : () => <></>;
  const onSelectedDataSource = (e) => {
    const dataConnectionId = e[0] ? e[0].id : undefined;
    const dataConnectionLabel = e[0] ? e[0].label : undefined;
    if (dataConnectionId !== paradataSourceMDSId) {
      shouldSkipAgentIdResetRef.current = false;
    }
    if (!shouldSkipAgentIdResetRef.current) {
      setDeepResearchAgentId(undefined);
    }
    shouldSkipAgentIdResetRef.current = false;
    setDataSourceMDSId(dataConnectionId);
    handleSelectedDataSourceChange(dataConnectionId, dataConnectionLabel);
  };

  const executeButtonDisabled =
    para.isDeepResearch &&
    !!deepResearchBaseMemoryId &&
    deepResearchMemoryId === deepResearchBaseMemoryId;
  const executeButton = (
    <EuiSmallButton
      data-test-subj={`runRefreshBtn-${index}`}
      onClick={() => onRunPara()}
      disabled={executeButtonDisabled}
    >
      {isOutputAvailable && (!para.isDeepResearch || !deepResearchBaseMemoryId) ? 'Refresh' : 'Run'}
    </EuiSmallButton>
  );

  return (
    <EuiPanel
      className="notebookParagraphWrapper"
      hasShadow={false}
      paddingSize="none"
      hasBorder={false}
    >
      {<ParagraphActionPanel idx={index} scrollToPara={scrollToPara} deletePara={deletePara} />}
      {dataSourceEnabled &&
        !para.isVizualisation &&
        !para.isAnomalyVisualizationAnalysis &&
        !para.isLogPattern && (
          <EuiFlexGroup style={{ marginTop: 0 }}>
            <EuiFlexItem>
              <DataSourceSelector
                savedObjectsClient={savedObjectsMDSClient.client}
                notifications={notifications}
                onSelectedDataSource={onSelectedDataSource}
                disabled={false}
                fullWidth={false}
                removePrepend={false}
                defaultOption={
                  paradataSourceMDSId !== undefined ? [{ id: paradataSourceMDSId }] : undefined
                }
                dataSourceFilter={dataSourceFilterFn}
              />
            </EuiFlexItem>
            {para.isDeepResearch && (
              <>
                <EuiFlexItem>
                  <MemorySelector
                    value={deepResearchBaseMemoryId}
                    onChange={setDeepResearchBaseMemoryId}
                    memoryIds={memoryIds}
                  />
                </EuiFlexItem>
                <EuiFlexItem>
                  <AgentsSelector
                    http={http}
                    value={deepResearchAgentId}
                    dataSourceMDSId={dataSourceMDSId}
                    onChange={setDeepResearchAgentId}
                  />
                </EuiFlexItem>
              </>
            )}
          </EuiFlexGroup>
        )}
      <div key={index} className={paraClass}>
        {!para.isAnomalyVisualizationAnalysis && !para.isLogPattern && (
          <>
            <EuiSpacer size="s" />
            <EuiCompressedFormRow
              fullWidth={true}
              helpText={paragraphLabel}
              isInvalid={showQueryParagraphError}
              error={queryErrorMessage}
            >
              <ParaInput
                para={para}
                index={index}
                runParaError={runParaError}
                textValueEditor={textValueEditor}
                handleKeyPress={handleKeyPress}
                startTime={para.visStartTime}
                setStartTime={setStartTime}
                endTime={para.visEndTime}
                setEndTime={setEndTime}
                setIsOutputStale={setIsOutputStale}
                visOptions={visOptions}
                selectedVisOption={selectedVisOption}
                setSelectedVisOption={setSelectedVisOption}
                setVisType={setVisType}
                dataSourceManagement={dataSourceManagement}
                notifications={notifications}
                dataSourceEnabled={dataSourceEnabled}
                savedObjectsMDSClient={savedObjectsMDSClient}
              />
            </EuiCompressedFormRow>
            {runParaError && (
              <EuiText color="danger" size="s" data-test-subj="paragraphInputErrorText">{`${
                para.isVizualisation ? 'Visualization' : 'Input'
              } is required.`}</EuiText>
            )}
            <EuiSpacer size="m" />
            <EuiFlexGroup alignItems="center" gutterSize="s">
              <EuiFlexItem grow={false}>
                {executeButtonDisabled ? (
                  <EuiToolTip content="Insert a new deep research paragraph to execute base selected memory">
                    {executeButton}
                  </EuiToolTip>
                ) : (
                  executeButton
                )}
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="m" />
          </>
        )}
        {props.selectedViewId !== 'input_only' && isOutputAvailable && (
          <div style={{ opacity: para.isOutputStale ? 0.5 : 1 }}>{paraOutput}</div>
        )}
      </div>
    </EuiPanel>
  );
});
