/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '@testing-library/react';
import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { uiSettingsService } from '../../../../../../common/utils/core_services';
import {
  sampleObservabilityVizParagraph,
  sampleParsedParagraghs1,
} from '../../../../../../test/notebooks_constants';
import { ParaOutput } from '../para_output';

jest.mock('../../bubbleup/bubble_up_container', () => ({
  BubbleUpContainer: () => <div />,
}));

describe('<ParaOutput /> spec', () => {
  configure({ adapter: new Adapter() });

  it('renders markdown outputs', () => {
    const para = sampleParsedParagraghs1[0];
    const setVisInput = jest.fn();
    const utils = render(
      <ParaOutput
        key={para.uniqueId}
        para={para}
        visInput={jest.fn()}
        setVisInput={setVisInput}
        DashboardContainerByValueRenderer={jest.fn()}
      />
    );
    expect(utils.container.firstChild).toMatchSnapshot();
  });

  it('renders query outputs', () => {
    const para = sampleParsedParagraghs1[3];
    const setVisInput = jest.fn();
    const utils = render(
      <ParaOutput
        key={para.uniqueId}
        para={para}
        visInput={jest.fn()}
        setVisInput={setVisInput}
        DashboardContainerByValueRenderer={jest.fn()}
      />
    );
    expect(utils.container.firstChild).toMatchSnapshot();
  });

  it('renders query outputs with error', () => {
    const para = sampleParsedParagraghs1[3];
    para.out = ['{"error":"Invalid SQL query"}'];
    const setVisInput = jest.fn();
    const utils = render(
      <ParaOutput
        key={para.uniqueId}
        para={para}
        visInput={jest.fn()}
        setVisInput={setVisInput}
        DashboardContainerByValueRenderer={jest.fn()}
      />
    );
    expect(utils.container.firstChild).toMatchSnapshot();
  });

  it('renders dashboards visualization outputs', () => {
    const para = sampleParsedParagraghs1[2];

    uiSettingsService.get = jest.fn().mockReturnValue('YYYY-MMM-DD HH:mm:ss');
    const setVisInput = jest.fn();
    const utils = render(
      <ParaOutput
        key={para.uniqueId}
        para={para}
        visInput={{
          timeRange: { from: '2020-JUL-21 18:37:44', to: '2020-AUG-20 18:37:44' },
        }}
        setVisInput={setVisInput}
        DashboardContainerByValueRenderer={() => null}
      />
    );
    expect(utils.container.textContent).toMatch('2020-Jul-21 18:37:44 - 2020-Aug-20 18:37:44');
    expect(utils.container.firstChild).toMatchSnapshot();
  });

  it('renders observability visualization outputs', () => {
    const para = sampleObservabilityVizParagraph;

    uiSettingsService.get = jest.fn().mockReturnValue('YYYY-MMM-DD HH:mm:ss');
    const setVisInput = jest.fn();
    const utils = render(
      <ParaOutput
        key={para.uniqueId}
        para={para}
        visInput={{
          timeRange: { from: '2020-JUL-21 18:37:44', to: '2020-AUG-20 18:37:44' },
        }}
        setVisInput={setVisInput}
        DashboardContainerByValueRenderer={() => null}
      />
    );
    expect(utils.container.textContent).toMatch('2020-Jul-21 18:37:44 - 2020-Aug-20 18:37:44');
    expect(utils.container.firstChild).toMatchSnapshot();
  });

  it('renders other types of outputs', () => {
    const para = sampleParsedParagraghs1[0];
    para.typeOut = ['HTML', 'TABLE', 'IMG', 'UNKNOWN', undefined];
    para.out = ['', '', '', '', ''];
    const setVisInput = jest.fn();
    const utils = render(
      <ParaOutput
        key={para.uniqueId}
        para={para}
        visInput={jest.fn()}
        setVisInput={setVisInput}
        DashboardContainerByValueRenderer={jest.fn()}
      />
    );
    expect(utils.container.firstChild).toMatchSnapshot();
  });
});
