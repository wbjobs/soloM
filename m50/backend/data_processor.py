import pandas as pd
import numpy as np
from collections import defaultdict
import json

class SankeyDataProcessor:
    def __init__(self, csv_path):
        self.csv_path = csv_path
        self.df = None
        self.nodes = []
        self.links = []
        self.node_conversion = {}
        
    def load_data(self):
        self.df = pd.read_csv(self.csv_path)
        self.df['timestamp'] = pd.to_datetime(self.df['timestamp'])
        self.df = self.df.sort_values(['user_id', 'timestamp'])
        return self
    
    def clean_data(self):
        self.df = self.df.dropna(subset=['user_id', 'timestamp', 'page_url'])
        self.df['user_id'] = self.df['user_id'].astype(str)
        self.df['page_url'] = self.df['page_url'].str.strip()
        self.df = self.df[self.df['page_url'] != '']
        return self
    
    def filter_by_date(self, start_date=None, end_date=None):
        if self.df is None:
            return self
        
        filtered_df = self.df
        
        if start_date:
            start = pd.to_datetime(start_date)
            filtered_df = filtered_df[filtered_df['timestamp'] >= start]
        
        if end_date:
            end = pd.to_datetime(end_date) + pd.Timedelta(days=1)
            filtered_df = filtered_df[filtered_df['timestamp'] < end]
        
        self.df = filtered_df
        return self
    
    def get_date_range(self):
        if self.df is None or len(self.df) == 0:
            return None, None
        return self.df['timestamp'].min().strftime('%Y-%m-%d'), self.df['timestamp'].max().strftime('%Y-%m-%d')
    
    def extract_user_paths(self, max_path_length=20):
        user_paths = defaultdict(list)
        for _, row in self.df.iterrows():
            user_paths[row['user_id']].append(row['page_url'])
        
        filtered_paths = {}
        for user_id, path in user_paths.items():
            unique_path = []
            seen_pages = set()
            iterations = 0
            for page in path:
                iterations += 1
                if iterations > max_path_length * 10:
                    break
                if not unique_path or unique_path[-1] != page:
                    if page in seen_pages:
                        break
                    if len(unique_path) >= max_path_length:
                        break
                    seen_pages.add(page)
                    unique_path.append(page)
            if len(unique_path) >= 2:
                filtered_paths[user_id] = unique_path
        
        return filtered_paths
    
    def calculate_transitions(self, paths):
        transition_counts = defaultdict(int)
        page_visit_counts = defaultdict(int)
        page_exit_counts = defaultdict(int)
        total_users = len(paths)
        
        for user_id, path in paths.items():
            for i, page in enumerate(path):
                page_visit_counts[page] += 1
                if i < len(path) - 1:
                    next_page = path[i + 1]
                    transition_counts[(page, next_page)] += 1
                else:
                    page_exit_counts[page] += 1
        
        return transition_counts, page_visit_counts, page_exit_counts, total_users
    
    def _calculate_page_depths(self, paths):
        page_depths = defaultdict(list)
        for user_id, path in paths.items():
            for depth, page in enumerate(path):
                page_depths[page].append(depth)
        
        page_avg_depth = {}
        for page, depths in page_depths.items():
            page_avg_depth[page] = np.mean(depths)
        
        return page_avg_depth
    
    def build_sankey_data(self, max_depth=5, max_iterations=100000):
        paths = self.extract_user_paths(max_path_length=max_depth * 2)
        transition_counts, page_visit_counts, page_exit_counts, total_users = self.calculate_transitions(paths)
        
        all_pages = set()
        for (source, target) in transition_counts.keys():
            all_pages.add(source)
            all_pages.add(target)
        
        entry_counts = defaultdict(int)
        for user_id, path in paths.items():
            if path:
                entry_counts[path[0]] += 1
        
        page_avg_depth = self._calculate_page_depths(paths)
        
        node_id_map = {}
        current_id = 0
        
        for page in sorted(all_pages, key=lambda p: (page_avg_depth.get(p, 999), -page_visit_counts[p])):
            node_id_map[page] = current_id
            visit_count = page_visit_counts[page]
            entry_count = entry_counts[page]
            exit_count = page_exit_counts[page]
            
            conversion_to_next = 0
            if visit_count > 0:
                conversion_to_next = ((visit_count - exit_count) / visit_count) * 100
            
            self.nodes.append({
                'id': current_id,
                'name': page,
                'visit_count': visit_count,
                'entry_count': entry_count,
                'exit_count': exit_count,
                'conversion_rate': round(conversion_to_next, 2),
                'entry_rate': round((entry_count / total_users) * 100, 2) if total_users > 0 else 0,
                'depth': page_avg_depth.get(page, 0)
            })
            current_id += 1
        
        graph = defaultdict(list)
        in_degree = defaultdict(int)
        sorted_transitions = sorted(
            transition_counts.items(),
            key=lambda x: (-x[1], page_avg_depth.get(x[0][0], 999))
        )
        
        iterations = 0
        for (source, target), count in sorted_transitions:
            iterations += 1
            if iterations > max_iterations:
                break
            
            if source in node_id_map and target in node_id_map:
                source_id = node_id_map[source]
                target_id = node_id_map[target]
                
                source_depth = page_avg_depth.get(source, 0)
                target_depth = page_avg_depth.get(target, 0)
                
                if source_depth > target_depth + 0.5:
                    continue
                
                if source_id == target_id:
                    continue
                
                def would_create_cycle_fast(g, s, t, max_check=1000):
                    if s == t:
                        return True
                    visited = set()
                    stack = [t]
                    checks = 0
                    while stack and checks < max_check:
                        checks += 1
                        current = stack.pop()
                        if current == s:
                            return True
                        if current in visited:
                            continue
                        visited.add(current)
                        if current in g:
                            stack.extend(g[current])
                    return False
                
                if would_create_cycle_fast(graph, source_id, target_id):
                    continue
                
                graph[source_id].append(target_id)
                in_degree[target_id] += 1
                
                source_visits = page_visit_counts[source]
                transition_probability = (count / source_visits) * 100 if source_visits > 0 else 0
                
                self.links.append({
                    'source': source_id,
                    'target': target_id,
                    'value': count,
                    'probability': round(transition_probability, 2)
                })
        
        self._calculate_conversion()
        
        return {
            'nodes': self.nodes,
            'links': self.links,
            'stats': {
                'total_users': total_users,
                'total_page_views': len(self.df),
                'unique_pages': len(self.nodes),
                'avg_path_length': round(np.mean([len(p) for p in paths.values()]), 2) if paths else 0
            }
        }
    
    def _calculate_conversion(self):
        for node in self.nodes:
            node_id = node['id']
            page_name = node['name']
            
            inflow = sum(link['value'] for link in self.links if link['target'] == node_id)
            outflow = sum(link['value'] for link in self.links if link['source'] == node_id)
            
            conversion_from_prev = 0
            if inflow > 0:
                conversion_from_prev = (outflow / inflow) * 100
            
            self.node_conversion[page_name] = {
                'inflow': inflow,
                'outflow': outflow,
                'conversion_from_prev': round(conversion_from_prev, 2)
            }
            
            node['inflow'] = inflow
            node['outflow'] = outflow
    
    def get_node_details(self, node_name):
        if node_name in self.node_conversion:
            node_data = next((n for n in self.nodes if n['name'] == node_name), None)
            if node_data:
                incoming_links = [
                    {
                        'source': self.nodes[link['source']]['name'],
                        'value': link['value'],
                        'probability': link['probability']
                    }
                    for link in self.links
                    if self.nodes[link['target']]['name'] == node_name
                ]
                
                outgoing_links = [
                    {
                        'target': self.nodes[link['target']]['name'],
                        'value': link['value'],
                        'probability': link['probability']
                    }
                    for link in self.links
                    if self.nodes[link['source']]['name'] == node_name
                ]
                
                return {
                    'node': node_data,
                    'conversion': self.node_conversion[node_name],
                    'incoming_links': incoming_links,
                    'outgoing_links': outgoing_links
                }
        return None

def process_sankey_data(csv_path, start_date=None, end_date=None):
    processor = SankeyDataProcessor(csv_path)
    processor.load_data().clean_data()
    
    min_date, max_date = processor.get_date_range()
    
    processor.filter_by_date(start_date, end_date)
    result = processor.build_sankey_data()
    
    result['date_range'] = {
        'min_date': min_date,
        'max_date': max_date,
        'selected_start': start_date,
        'selected_end': end_date
    }
    
    return result, processor
