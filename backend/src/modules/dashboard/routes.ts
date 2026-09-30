import { ApiRouter } from '../../utils/router';
import * as service from './service';

const r = new ApiRouter('/dashboard', 'Dashboard');
r.get('/', { summary: 'KPIs, chart series and alert lists for the dashboard' }, () => service.stats());

export default r;
